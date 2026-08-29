# WebRTC

Áudio sobre WebRTC sai **mono e estreito por padrão**, e o único lugar onde isso se corrige é o SDP. Este módulo traz a máquina de mexer nele — parsing, merge e fallback — mais o cap de envio, que é a outra metade do par que costuma confundir.

!!! info "Quando você precisa disto?"
    Se a chamada é só voz e o padrão do browser já serve, você não precisa. O momento em que isto vira necessário é o áudio de **tela compartilhada**: música e vídeo herdam o perfil de fala — mono, ~32 kbps, FEC ligado, DTX gateando as passagens quietas — e é exatamente por isso que áudio de tela numa chamada soa como telefone. Nenhuma API de alto nível deixa mudar isso.

## O problema, em uma linha

`RTCPeerConnection` não expõe knob de codec. O perfil do Opus vive numa linha `a=fmtp:` do SDP, e mexer nela é editar texto — com uma cauda longa de armadilhas de protocolo (RFC 7587), não de gosto.

## `tuneOpus` — perfil por m-line de áudio

```ts
import { tuneOpus } from "tempest-react-sdk";

const offer = await pc.createOffer();

const tuned = tuneOpus(offer.sdp!, {
  // por índice de m-line de áudio (0 = a primeira), ou por mid
  0: { maxAverageBitrate: 48_000, stereo: false, fec: true, dtx: true },
  1: { maxAverageBitrate: 192_000, stereo: true, fec: false, dtx: false },
});

await pc.setLocalDescription({ ...offer, sdp: tuned });
```

Um perfil só, aplicado a todas as m-lines de áudio, é a forma curta:

```ts
const tuned = tuneOpus(offer.sdp!, { stereo: true, dtx: false });
```

| Campo | Vira | Para quê |
| --- | --- | --- |
| `maxAverageBitrate` | `maxaveragebitrate` | teto que pedimos ao encoder **remoto** |
| `maxPlaybackRate` | `maxplaybackrate` | maior taxa que vale decodificar |
| `stereo` | `stereo` **e** `sprop-stereo` | dois canais nas duas direções |
| `fec` | `useinbandfec` | reconstrói pacote perdido — salva fala, borra música |
| `dtx` | `usedtx` | para de transmitir no silêncio — errado para música |
| `cbr` | `cbr` | bitrate constante |
| `extra` | o que você escrever | escape hatch para chave não modelada |

!!! danger "Sem tabela de presets, de propósito"
    Quais valores usar é decisão sua: voz numa mesh não quer o mesmo que áudio de sistema. Preset é justamente o tipo de coisa que não deve morar dentro de dependência — o que mora aqui é o parsing, o merge e o fallback, que é onde está a cauda longa.

### As armadilhas que isto resolve

Errar qualquer uma degrada **em silêncio**: ninguém vê exceção, o áudio só fica pior.

!!! warning "`stereo` e `sprop-stereo` apontam para lados opostos"
    `stereo=1` pede que o **remoto** mande dois canais; `sprop-stereo=1` anuncia que **nós** vamos mandar. Setar só um deixa o link assimétrico — o motivo recorrente de "pedi estéreo e veio mono". O campo `stereo` escreve os dois.

!!! warning "O `fmtp` já existe e não pode ser sobrescrito"
    O browser emite `a=fmtp:111 minptime=10;useinbandfec=1`. Trocar a linha inteira descarta o `minptime` — uma decisão de packetization que ninguém quis mudar. O merge é por chave: o que você não nomeia, fica.

!!! warning "O payload type varia, e pode haver mais de um"
    O número sai do `a=rtpmap:(\d+) opus/48000`, nunca de um `111` fixo. Todos os payloads Opus do bloco são ajustados.

!!! warning "Pode não haver `fmtp` nenhum"
    Aí a linha é **inserida** logo depois do `rtpmap`. "O parâmetro não existe" e "o parâmetro está vazio" são o mesmo pedido do ponto de vista de quem chama.

!!! warning "Só as m-lines de áudio"
    Com vários slots (mic + áudio de sistema em transceivers separados), cada um quer um perfil diferente — e a contagem de índice ignora blocos de vídeo, então uma m-line de vídeo no meio não desloca nada.

## `setTunedLocalDescription` — o fallback que salva a chamada

```ts
import { setTunedLocalDescription } from "tempest-react-sdk";

const applied = await setTunedLocalDescription(pc, await pc.createOffer(), profiles);
if (applied === "original") logger.warn("o browser recusou o perfil Opus");
```

O Chrome vem apertando o que `setLocalDescription` aceita de SDP editado, e não há como saber de antemão. Sem fallback para o SDP original, **a chamada morre em vez de perder o perfil** — que é a troca errada por uma margem larga: áudio pior é melhor que nenhum áudio.

O retorno diz qual dos dois entrou, porque `"original"` significa que o perfil silenciosamente não se aplicou — coisa que vale telemetria.

## `setSenderBitrate` — a outra metade do par

```ts
import { setSenderBitrate } from "tempest-react-sdk";

const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
if (sender) await setSenderBitrate(sender, 48_000);
```

!!! tip "`fmtp` é o que queremos **receber**; `setParameters` limita o que **enviamos**"
    Os dois são necessários, e numa topologia **mesh** o segundo é o que importa: o uplink carrega uma cópia do stream por participante, então é ele que satura primeiro.

Duas coisas fazem disto uma função em vez de duas linhas no seu código: `setParameters` só aceita **o mesmo objeto** que `getParameters` devolveu (um objeto novo é recusado), e um sender que ainda não negociou reporta **nenhum** encoding — escrever em `encodings[0]` sem checar lança exatamente na chamada que tenta fixar o cap antes da primeira offer. `null` levanta o cap; o retorno é `false` quando o browser recusa, e aí a chamada continua sem cap em vez de quebrar.

## Medindo o link: `createLinkStatsSampler` e `useLinkStats`

O badge que toda chamada mostra — `1,2 Mbps · 42 ms · 1080p60` — não vem pronto de lugar nenhum. `getStats()` devolve dezenas de entradas com contadores **cumulativos**, e transformar isso em três números é onde cada app reescreve os mesmos dois erros.

### Em React

```ts
import { useLinkStats } from "tempest-react-sdk";

function LinkBadge({ pc }: { pc: RTCPeerConnection | null }) {
  const stats = useLinkStats(pc);

  if (!stats) return <span>medindo…</span>;

  return (
    <span>
      {stats.kbps} kbps · {stats.rttMs ?? "—"} ms · {stats.width}×{stats.height}
      {stats.fps > 0 ? `@${stats.fps}` : ""}
    </span>
  );
}
```

Amostra a cada 2 s, **só** enquanto `connectionState === "connected"`, e para de amostrar quando a aba vai para segundo plano.

### Fora do React

```ts
import { createLinkStatsSampler } from "tempest-react-sdk";

const sampler = createLinkStatsSampler();

setInterval(async () => {
  const stats = await sampler.sample(pc);
  badge.textContent = `${stats.kbps} kbps`;
}, 2000);
```

!!! warning "Um sampler por conexão"
    A taxa é um **delta**, então o sampler guarda a leitura anterior. Compartilhar um sampler entre peers subtrai o contador de uma conexão do de outra e reporta bobagem. Uma mesh de 5 pessoas tem 4 samplers.

Já tem o relatório em mãos? `sampler.read(report)` faz a redução sem buscar de novo — útil quando o mesmo `getStats()` alimenta mais de uma coisa.

### Os dois erros que isto evita

**1. RTT lido do par errado.** Uma conexão mantém vários pares de candidatos vivos ao mesmo tempo — host, server-reflexive, relayed — e só **um** carrega tráfego. Pegar o primeiro `candidate-pair` com `state: "succeeded"` faz o número saltar entre caminhos que não estão sendo percorridos: 8 ms do par host ocioso alternando com 180 ms do TURN que está trabalhando.

O correto é o par que o `transport` nomeia em `selectedCandidatePairId`. `readRoundTripMs` faz isso, e é exportado sozinho porque é útil fora do sampler:

```ts
import { readRoundTripMs } from "tempest-react-sdk";

const rttMs = readRoundTripMs(await pc.getStats());
```

**2. Vazão derivada sem delta.** `bytesSent` é cumulativo desde que a conexão abriu. Dividir pelo tempo de sessão dá a média histórica — um número que só desce e nunca mostra o que está acontecendo agora. A taxa é `(bytes − bytesAnterior) × 8 ÷ 1000 ÷ segundos`, e guardar o "anterior" é exatamente a parte que cada cópia refaz.

### O que o sampler soma, e por quê

| Campo | Vem de |
| --- | --- |
| `kbps` | soma de **todos** os senders que casam com `kind` |
| `width` / `height` / `fps` | o stream de **maior área**, não o último reportado |
| `rttMs` | o par de candidatos selecionado pelo transporte |

Um peer publicando câmera e tela ao mesmo tempo ocupa **um** uplink com as duas — e o uplink é o que acaba. Por isso a soma. A resolução vem do maior porque é ele que domina essa banda e é nele que quem assiste está olhando.

O padrão é contar só vídeo. `kind: "all"` inclui áudio quando o número precisa ser o custo real da conexão:

```ts
const sampler = createLinkStatsSampler({ kind: "all" });
```

### Pausa, retomada e `reset()`

```ts
const stats = useLinkStats(pc, {
  intervalMs: 2000,       // getStats percorre todo o relatório; 2 s não é preguiça
  pauseWhenHidden: true,  // default
  kind: "video",          // default
});
```

Voltar de segundo plano chama `reset()` antes da próxima amostra. Sem isso, o primeiro sample depois de cinco minutos de aba oculta divide cinco minutos de bytes por cinco minutos e reporta a média de um período que ninguém perguntou. Chame `sampler.reset()` na mão pelo mesmo motivo depois de um **ICE restart** ou uma reconexão.

`reset()` limpa o baseline, não a tela: a próxima leitura volta com `kbps: 0` e mantém a resolução e o RTT que já estavam à mostra, para o badge não piscar.

!!! tip "A última leitura sobrevive à pausa"
    `useLinkStats` mantém o valor anterior enquanto está pausado, em vez de voltar a `null`. Um badge que apaga toda vez que a aba perde o foco é lido como conexão caída.

### O que isto **não** mede

Escrito aqui de propósito: cada item é uma pergunta que o relatório responde e este módulo não, para você saber onde procurar em vez de descobrir que o número estava mentindo.

- **O que você recebe.** Só há `outbound-rtp` aqui. "O vídeo do outro está travando" é `inbound-rtp` (`bytesReceived`, `framesDecoded`, `packetsLost`), e a leitura tem forma diferente o bastante para não caber na mesma redução — ela responde sobre o **encoder do outro**, não sobre o seu uplink.
- **Por que a taxa caiu.** `qualityLimitationReason` (`"bandwidth"`, `"cpu"`, `"none"`) está no mesmo `outbound-rtp` e distingue "a rede apertou" de "esta máquina não dá conta" — que levam a ações opostas. Leia direto do relatório quando precisar.
- **Perda e jitter.** `packetsLost` e `jitter` existem, mas são interpretados contra o total enviado no mesmo intervalo; um contador cru de perdidos é um número sem denominador.
- **A cadência, quando a aba está oculta.** Com `pauseWhenHidden: false` o timer continua, mas o browser afoga timers em segundo plano (Chrome vai para ≥ 1 min). Nenhuma API contorna isso — a amostragem simplesmente fica mais espaçada, e o delta continua correto porque é derivado do tempo medido, não do intervalo pedido.
- **Comportamento de browser real.** Os testes deste módulo rodam em jsdom, que não tem WebRTC nenhum: eles provam a **redução** contra relatórios sintéticos, não a conexão. A forma do relatório foi conferida à parte, no Chromium, com dois `RTCPeerConnection` em loopback carregando um canvas 640×360@30 — o mesmo relatório traz `kind` **e** `mediaType`, `frameWidth`/`frameHeight`/`framesPerSecond` vêm preenchidos, `transport.selectedCandidatePairId` existe, e a primeira amostra vem a `0` kbps antes de estabilizar em ~350 kbps. Ainda assim, confirme na sua topologia antes de confiar num painel em produção: relay TURN, simulcast e mobile mudam o que aparece.

!!! note "`rttMs: 0` não é `rttMs: null`"
    Zero é uma leitura — foi o que o loopback local mediu. `null` significa que **nenhum** par reportou timing ainda, o que é o estado normal enquanto a conexão assenta. Uma UI que trata os dois igual mostra "0 ms" para uma chamada que ainda não conectou.

### Quando o browser não colabora

O módulo já cobre o que varia entre engines, e vale saber que varia:

| Situação | O que acontece |
| --- | --- |
| Browser não preenche `selectedCandidatePairId` | cai para o primeiro par `succeeded` com timing |
| Browser reporta `mediaType` em vez de `kind` (Chrome antigo) | os dois são lidos |
| `framesPerSecond` ausente | `fps: 0`, e a última leitura boa é mantida |
| Contador reinicia (ICE restart) | delta negativo vira `0` e o baseline se refaz |
| Simulcast (várias camadas no mesmo track) | as camadas somam; a resolução vem da maior |

## Recap

- `tuneOpus(sdp, profiles)` reescreve as m-lines de **áudio**: merge por chave, todos os payloads Opus, insere `fmtp` ausente, ignora vídeo.
- `stereo` escreve `stereo` **e** `sprop-stereo` — setar um só é o motivo clássico de "veio mono".
- Perfil por índice de m-line de áudio ou por `mid`; um perfil solto vale para todas.
- Sem presets embutidos: os valores são decisão do consumidor.
- `setTunedLocalDescription` tenta o SDP editado e cai para o original — perder o perfil é muito mais barato que perder a chamada.
- `setSenderBitrate` limita o **envio**, que é o que satura o uplink numa mesh.
- `useLinkStats(pc)` dá `kbps`, resolução, fps e RTT com pausa em aba oculta; `createLinkStatsSampler()` faz o mesmo fora do React, **um por conexão**.
- `readRoundTripMs(report)` lê o par de candidatos **selecionado**, não o primeiro `succeeded` — é a diferença entre 42 ms e um número que pula.
- Taxa é delta: `reset()` depois de ICE restart, reconexão ou pausa longa.

## Veja também

- [Áudio](./audio.md) — `createAudioBus` para ganho acima de 100% e roteamento de saída
- [WebSocket](./websocket.md) — o canal de signaling
