# Compartilhar com prévia no WhatsApp

O motorista do BusCar publicou uma carona Picos → Teresina para sexta às 07:05 e quer
**divulgar** no grupo da cidade. Ele toca em "Compartilhar", escolhe o grupo e a mensagem
chega com o **cartão de prévia**: a imagem da carona, o título e o link que leva direto à
reserva. No notebook, sem folha de compartilhamento do sistema, o mesmo botão abre o
WhatsApp Web com o texto pronto. 📣

Isso tem duas metades. A do **front** é o botão, e é o que o SDK entrega pronto. A do
**backend** é a página que o robô do WhatsApp lê para montar a prévia — sem ela, o link
chega pelado.

!!! info "Antes de começar"
    Instalação em [instalação manual](../index.md#instalacao-manual). O lado do servidor
    segue o contrato de um serviço FastAPI sobre o `tempest-fastapi-sdk`; a página de
    compartilhamento dele está em
    [tempest-fastapi-sdk#814](https://github.com/mauriciobenjamin700/tempest-fastapi-sdk/issues/814).

## O que vamos construir

- 📲 No celular: a **folha do sistema** com a imagem da prévia anexada, onde o aparelho
  aceita arquivo.
- 💬 Sem Web Share: o link `wa.me/?text=…`, que abre o **seletor de conversa** do WhatsApp
  com o texto pronto.
- 🔗 "Copiar link" que funciona até no navegador interno do Instagram.
- 🖼️ A prévia (imagem, título, descrição) vinda das tags **Open Graph** de `/c/<id>`.
- 🧭 Um ícone de compartilhar no card da lista, e os três botões na tela da carona.

## O código, arquivo por arquivo

### 1. O link e o texto

```ts
// src/lib/ride-share.ts
export interface Ride {
  id: string;
  origin: string;
  destination: string;
  departure: Date;
  seats: number;
}

export function rideShareUrl(ride: Ride, origin: string = window.location.origin): string {
  return `${origin}/c/${ride.id}`;
}

export function rideShareText(ride: Ride): string {
  const day = ride.departure.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = ride.departure.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const seats = ride.seats === 1 ? "1 vaga" : `${ride.seats} vagas`;
  return `🚗 Carona ${ride.origin} → ${ride.destination}\n${day} às ${time} · ${seats}`;
}
```

### 2. Os botões na tela da carona

```tsx
// src/features/rides/RideShare.tsx
import { ShareActions, useToast } from "tempest-react-sdk";
import { rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideShare({ ride }: { ride: Ride }) {
  const toast = useToast();
  const url = rideShareUrl(ride);

  return (
    <ShareActions
      title={`Carona ${ride.origin} → ${ride.destination}`}
      text={rideShareText(ride)}
      url={url}
      imageUrl={`${url}/og.png`}
      onCopy={(copied) => copied && toast.success("Link da carona copiado")}
    />
  );
}
```

### 3. O ícone no card da lista

```tsx
// src/features/rides/RideCard.tsx
import { Card, ShareButton } from "tempest-react-sdk";
import { rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideCard({ ride }: { ride: Ride }) {
  const url = rideShareUrl(ride);
  return (
    <Card
      title={`${ride.origin} → ${ride.destination}`}
      actions={
        <ShareButton
          iconOnly
          size="sm"
          labels={{ native: "Compartilhar a carona", whatsapp: "Divulgar a carona no WhatsApp" }}
          text={rideShareText(ride)}
          url={url}
          imageUrl={`${url}/og.png`}
        />
      }
    >
      {ride.seats} vagas
    </Card>
  );
}
```

### 4. O nginx encaminha `/c/` para o backend

```nginx
# nginx.conf — dentro do server { } que serve o app
location ^~ /c/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 5. O que `/c/<id>` devolve

O backend responde HTML com as tags que o robô lê, e manda o humano para a tela do app:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Carona Picos → Teresina</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Carona Picos → Teresina" />
    <meta property="og:description" content="Sexta 07:05 · 3 vagas" />
    <meta property="og:url" content="https://app.exemplo.com/c/42" />
    <meta property="og:image" content="https://app.exemplo.com/c/42/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="canonical" href="https://app.exemplo.com/c/42" />
    <meta http-equiv="refresh" content="0; url=/caronas/42" />
  </head>
  <body><a href="/caronas/42">Abrir a carona</a></body>
</html>
```

## Pedaço por pedaço

### Por que a prévia é do backend

O WhatsApp monta o cartão lendo as tags **Open Graph** do HTML que o link devolve, e o
robô dele **não executa JavaScript**. Um SPA Vite devolve o mesmo `index.html` vazio para
toda rota, então não há tag por carona para ler. Por isso `/c/<id>` é uma página do
backend, por trás do mesmo domínio: o nginx manda o prefixo para lá (o `^~` vence a regra
de estáticos, que pegaria o `og.png`).

!!! warning "`og:image` precisa ser URL absoluta"
    Com caminho relativo, a maioria dos robôs não acha a imagem. Use a origem pública
    (`https://…`), e 1200×630, o tamanho que o cartão grande espera.

### `ShareActions`: três caminhos, cada um onde funciona

- **WhatsApp** é um `<a>` para `wa.me/?text=…`, montado por
  [`whatsAppShareUrl`](../br-pagamentos.md#divulgar-sem-destinatario-whatsappshareurl).
  O texto termina com o link (o `ShareActions` o anexa se o texto ainda não o tem), e é
  desse link que o WhatsApp tira a prévia. Sem número: o próprio WhatsApp pergunta para
  qual conversa ou grupo.
- **Compartilhar** abre a folha do sistema por [`useShare`](../share.md#useshare-compartilhar-com-imagem-e-fallback).
  Onde o aparelho aceita arquivo, o `og.png` vai **anexado** — a imagem aparece mesmo num
  destino que não monta prévia — e o link entra no texto, porque com arquivo a maioria dos
  destinos descarta o `url` separado.
- **Copiar link** tenta a Clipboard API, depois `execCommand("copy")`, e no último caso
  mostra o link selecionado num campo, para tocar e segurar.

### A escolha é por capacidade

"Compartilhar" aparece onde `navigator.share` existe — não onde o user agent diz
"celular". O Chrome no Windows tem a folha do sistema e ganha o botão; o Firefox desktop não
tem e fica com WhatsApp e "Copiar link". O `ShareButton` do card segue a mesma regra num
botão só: folha do sistema onde existe, link `wa.me` onde não — e o rótulo diz qual é.

### A imagem não pode atrasar o clique

`navigator.share` só roda enquanto o gesto do clique está vivo (5 s no Chromium, medido; o
WebKit é mais estrito). Os botões começam a baixar o `og.png` no `pointerenter`, `focus` e
`pointerdown`, e o `share` espera a imagem no máximo 3 s. Se ela não chega — rede, CORS,
404 —, compartilha sem ela. Nada disso vira erro na tela: fechar a folha é
`"cancelled"`, não falha.

!!! tip "A imagem no mesmo domínio poupa CORS"
    O `useShare` baixa a imagem com `fetch`. Servida pelo backend atrás do mesmo nginx
    (`/c/<id>/og.png`), ela é same-origin e não precisa de cabeçalho CORS.

## Recap

- ✅ A prévia vem das tags Open Graph de uma página do **backend** (`/c/<id>`), com
  `og:image` absoluta de 1200×630; o nginx encaminha o prefixo.
- ✅ `ShareActions` dá WhatsApp (`wa.me/?text=`), folha do sistema com a imagem anexada e
  "Copiar link" com fallback até o campo selecionado.
- ✅ `ShareButton` é o botão único do card: folha do sistema ou `wa.me`, por capacidade.
- ✅ `whatsAppShareUrl(text)` (em `/br`) monta o link sem destinatário.
- ✅ Textos traduzíveis por `tempest.share.*`; cancelar não é erro.
