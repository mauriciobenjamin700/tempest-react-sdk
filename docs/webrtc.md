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

## Recap

- `tuneOpus(sdp, profiles)` reescreve as m-lines de **áudio**: merge por chave, todos os payloads Opus, insere `fmtp` ausente, ignora vídeo.
- `stereo` escreve `stereo` **e** `sprop-stereo` — setar um só é o motivo clássico de "veio mono".
- Perfil por índice de m-line de áudio ou por `mid`; um perfil solto vale para todas.
- Sem presets embutidos: os valores são decisão do consumidor.
- `setTunedLocalDescription` tenta o SDP editado e cai para o original — perder o perfil é muito mais barato que perder a chamada.
- `setSenderBitrate` limita o **envio**, que é o que satura o uplink numa mesh.

## Veja também

- [Áudio](./audio.md) — `createAudioBus` para ganho acima de 100% e roteamento de saída
- [WebSocket](./websocket.md) — o canal de signaling
