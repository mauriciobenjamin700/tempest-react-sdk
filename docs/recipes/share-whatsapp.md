# Compartilhar com prévia no WhatsApp

O motorista do BusCar publicou uma carona Picos → Teresina para sexta às 07:05 e quer
**divulgar** no grupo da cidade. Ele toca em "Compartilhar", escolhe o grupo e a mensagem
chega com o **cartão de prévia**: a imagem da carona, o título e o link que leva direto à
reserva. No notebook, sem folha de compartilhamento do sistema, o mesmo botão abre o
WhatsApp Web com o texto pronto. E, para o status ou para o vidro do carro, ele baixa a
**moldura**: uma imagem com a foto dele, o trajeto e um QR Code que leva ao mesmo link. 📣

Isso tem duas metades. A do **front** são os botões, e é o que o SDK entrega pronto. A do
**backend** é a página que o robô do WhatsApp lê para montar a prévia, o card PNG, o QR e
a moldura. Sem ela, o link chega pelado.

!!! info "Antes de começar"
    Instalação em [instalação manual](../index.md#instalacao-manual). O backend é um
    serviço FastAPI com `tempest-fastapi-sdk[image]>=0.371.0`. Esta receita mostra só o
    que o front precisa saber dele; a profundidade (resolver, card, `ETag`, fonte no
    Docker) está nas receitas
    [Compartilhar com prévia](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/share-preview/)
    e [QR Code com logo e moldura](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/qr-logo/)
    do `tempest-fastapi-sdk`.

## O que vamos construir

- 📲 No celular: a **folha do sistema** com a imagem da prévia anexada, onde o aparelho
  aceita arquivo.
- 💬 Sem Web Share: o link `wa.me/?text=…`, que abre o **seletor de conversa** do WhatsApp
  com o texto pronto.
- 🔗 "Copiar link" que funciona até no navegador interno do Instagram.
- 🖼️ A prévia (imagem, título, descrição) vinda das tags **Open Graph** de `/s/<id>`,
  servida pelo `make_share_router` do backend.
- 🔳 O **QR Code** da carona na tela, e a **moldura** (vertical para o status, quadrada
  para conversa) compartilhada como arquivo onde dá, e baixada onde não dá.
- 🧭 Um ícone de compartilhar no card da lista, e os três botões na tela da carona.

## O código, arquivo por arquivo

### 1. Os links e o texto

```ts
// src/lib/ride-share.ts
export interface Ride {
  id: string;
  origin: string;
  destination: string;
  departure: Date;
  seats: number;
  updatedAt: string;
}

export type FrameLayout = "story" | "square";

export function rideShareUrl(ride: Ride, origin: string = window.location.origin): string {
  return `${origin}/s/${encodeURIComponent(ride.id)}`;
}

export function ridePreviewImageUrl(ride: Ride): string {
  return `${rideShareUrl(ride)}/og.png?v=${encodeURIComponent(ride.updatedAt)}`;
}

export function rideQrUrl(ride: Ride): string {
  return `/api/caronas/${encodeURIComponent(ride.id)}/qr.png?v=${encodeURIComponent(ride.updatedAt)}`;
}

export function rideFrameUrl(ride: Ride, layout: FrameLayout): string {
  const params = new URLSearchParams({ layout, v: ride.updatedAt });
  return `/api/caronas/${encodeURIComponent(ride.id)}/moldura.png?${params.toString()}`;
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
import { ridePreviewImageUrl, rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideShare({ ride }: { ride: Ride }) {
  const toast = useToast();

  return (
    <ShareActions
      title={`Carona ${ride.origin} → ${ride.destination}`}
      text={rideShareText(ride)}
      url={rideShareUrl(ride)}
      imageUrl={ridePreviewImageUrl(ride)}
      onCopy={(copied) => copied && toast.success("Link da carona copiado")}
    />
  );
}
```

### 3. O ícone no card da lista

```tsx
// src/features/rides/RideCard.tsx
import { Card, ShareButton } from "tempest-react-sdk";
import { ridePreviewImageUrl, rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideCard({ ride }: { ride: Ride }) {
  return (
    <Card
      title={`${ride.origin} → ${ride.destination}`}
      actions={
        <ShareButton
          iconOnly
          size="sm"
          labels={{ native: "Compartilhar a carona", whatsapp: "Divulgar a carona no WhatsApp" }}
          text={rideShareText(ride)}
          url={rideShareUrl(ride)}
          imageUrl={ridePreviewImageUrl(ride)}
        />
      }
    >
      {ride.seats} vagas
    </Card>
  );
}
```

### 4. O QR Code e a moldura

```tsx
// src/features/rides/RideFrame.tsx
import { Button, Image, useShare } from "tempest-react-sdk";
import { rideFrameUrl, rideQrUrl, rideShareText, rideShareUrl, type FrameLayout, type Ride } from "@/lib/ride-share";

const LAYOUTS: ReadonlyArray<{ layout: FrameLayout; label: string }> = [
  { layout: "story", label: "para o status" },
  { layout: "square", label: "para conversa" },
];

export function RideFrame({ ride }: { ride: Ride }) {
  const { canShareFiles, share, prefetchImage } = useShare();

  return (
    <section>
      <Image
        src={rideQrUrl(ride)}
        alt={`QR Code da carona ${ride.origin} → ${ride.destination}`}
        width={240}
        height={240}
      />
      {LAYOUTS.map(({ layout, label }) => {
        const imageUrl = rideFrameUrl(ride, layout);
        const imageFileName = `carona-${ride.id}-${layout}.png`;
        if (!canShareFiles) {
          return (
            <Button key={layout} variant="outline" href={imageUrl} download={imageFileName}>
              Baixar a imagem {label}
            </Button>
          );
        }
        return (
          <Button
            key={layout}
            variant="outline"
            onPointerEnter={() => prefetchImage(imageUrl)}
            onPointerDown={() => prefetchImage(imageUrl)}
            onFocus={() => prefetchImage(imageUrl)}
            onClick={() =>
              void share({ text: rideShareText(ride), url: rideShareUrl(ride), imageUrl, imageFileName })
            }
          >
            Compartilhar a imagem {label}
          </Button>
        );
      })}
    </section>
  );
}
```

### 5. O backend: `make_share_router`

Do lado do servidor, quem responde `/s/{id}` é o `make_share_router`. Você escreve o
resolver, que diz o que mostrar de cada carona, e ele cuida do HTML, do card e do cache.
Resumido da [receita do backend](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/share-preview/):

```python
app.include_router(
    make_share_router(
        resolve_trip,
        public_url=settings.PUBLIC_URL,
        fallback=SharePreviewSchema(
            title="BusCar",
            description="Caronas entre cidades",
            redirect_url="https://app.exemplo.com",
        ),
        renderer=ShareCardRenderer(background=("#0b3d91", "#061f4a"), accent_color="#ffd166"),
        site_name="BusCar",
        locale="pt_BR",
        link_text="Abrir no app",
    )
)
```

Isso registra duas rotas, ambas `GET` e `HEAD` e fora do OpenAPI:

| Rota | O que devolve |
| --- | --- |
| `GET /s/{id}` | HTML com `og:title`, `og:description`, `og:image` (com `?v=`), `og:url`, `twitter:card`, `<link rel=canonical>`; a pessoa segue para o `redirect_url` por `<meta http-equiv=refresh>` e por um link visível |
| `GET /s/{id}/og.png` | o card 1200×630, com `ETag` fraco, `304` e `Cache-Control: public, max-age=600` |

O QR e a moldura **não** são rotas do `make_share_router`: são duas rotas da carona que o
seu serviço escreve com `render_qr(url, logo=...)` e
`ShareFrameRenderer.render(ShareFrameSchema(url=...), layout=..., photo=...)`, como mostra
a [receita do QR](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/recipes/qr-logo/).
Nesta receita elas ficam sob `/api` (`/api/caronas/{id}/qr.png` e
`/api/caronas/{id}/moldura.png?layout=story|square`), e as duas desenham o QR apontando
para `/s/{id}`.

### 6. O nginx encaminha `/s/` e `/api/` para o backend

```nginx
# nginx.conf — dentro do server { } que serve o app
location ^~ /s/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ~* \.(?:js|css|png|jpg|svg|woff2)$ {
    expires 1y;
    try_files $uri =404;
}

location / {
    root /usr/share/nginx/html;
    try_files $uri /index.html;
}
```

Com o link servido pelo domínio do app, o `public_url` do backend é esse domínio
(`https://app.exemplo.com`), porque é ele que aparece no link.

Se em vez do nginx o próprio backend serve o SPA com `make_spa_router`, inclua o
`make_share_router` **antes** dele: o FastAPI casa as rotas na ordem de registro, e o
fallback do SPA responderia `/s/42` com o `index.html`.

### 7. Conferir com `curl`

Faça a requisição que o robô faz, pelo domínio público:

```bash
curl -s https://app.exemplo.com/s/42 | grep -E 'property="og:|twitter:card'
curl -sI https://app.exemplo.com/s/42/og.png
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://app.exemplo.com/api/caronas/42/moldura.png?layout=square"
```

O primeiro lista as tags, com `og:image` terminando em `/s/42/og.png?v=…`. O segundo tem
que dar `200`, `content-type: image/png` e um `etag: W/"…"`. Um `404` ali com `/s/42`
respondendo `200` é o bloco de estáticos do nginx pegando o `.png`: falta o `^~`.

## Pedaço por pedaço

### Por que a prévia é do backend

O WhatsApp monta o cartão lendo as tags **Open Graph** do HTML que o link devolve, e o
robô dele **não executa JavaScript**. Um SPA Vite devolve o mesmo `index.html` vazio para
toda rota, então não há tag por carona para ler. Por isso `/s/<id>` é uma página do
backend, por trás do mesmo domínio.

Carona apagada, privada ou esgotada continua respondendo `200`: o resolver devolve `None`
e a página mostra o `fallback`, sem `og:image` e sem contar o que a carona era. O
`og.png` dela dá `404`, e o `useShare` compartilha sem a imagem.

### O `^~` não é enfeite

O nginx escolhe primeiro o prefixo mais longo, mas depois testa as regras de **regex**, e
a primeira que casa vence. Um app Vite quase sempre tem uma regra de regex para estáticos
(`\.(js|css|png…)$`), e ela casa com `/s/42/og.png`. Medido com `nginx:alpine` na frente
do `tempest-fastapi-sdk` 0.371.0, com o bloco de estáticos acima (`docker run --network host`
com o `nginx.conf` do passo 6, e cada caminho lido com
`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088<caminho>`, em 23/11/2026):

| Bloco | `/s/42` | `/s/42/og.png` | `/api/caronas/42/moldura.png` |
| --- | --- | --- | --- |
| `location /s/`, `location /api/` | `200` | `404` | `404` |
| `location ^~ /s/`, `location ^~ /api/` | `200` | `200` | `200` |

Sem o `^~`, a página sai certa e a imagem some, e nenhum erro aparece: o robô
simplesmente monta a prévia sem imagem. O `^~` diz ao nginx que, casando esse prefixo, as
regex nem são testadas.

Pelo mesmo motivo, o QR e a moldura moram sob `/api/`, e não em `/caronas/42/qr.png`:
esse caminho é do SPA, e nunca chega ao backend. Na mesma medição ele deu `404` (o bloco
de estáticos pegou o `.png`); sem esse bloco, o `try_files … /index.html` devolveria o
HTML do app no lugar do PNG.

### `public_url` vem da configuração

O `make_share_router` não monta URL a partir do `Host` da requisição: atrás do nginx ele
seria o endereço interno (`http://backend:8000`), e o `Host` é o cliente quem escolhe.
`og:image` precisa ser **absoluta** e pública, porque o robô não resolve caminho relativo.
Por isso `public_url` é obrigatório e vem da configuração do serviço.

### `ShareActions`: três caminhos, cada um onde funciona

- **WhatsApp** é um `<a>` para `wa.me/?text=…`, montado por
  [`whatsAppShareUrl`](../br-pagamentos.md#divulgar-sem-destinatario-whatsappshareurl).
  O texto termina com o link (o `ShareActions` o anexa se o texto ainda não o tem), e é
  desse link que o WhatsApp tira a prévia. Sem número: o próprio WhatsApp pergunta para
  qual conversa ou grupo.
- **Compartilhar** abre a folha do sistema por [`useShare`](../share.md#useshare-compartilhar-com-imagem-e-fallback).
  Onde o aparelho aceita arquivo, o `og.png` vai **anexado** (a imagem aparece mesmo num
  destino que não monta prévia) e o link entra no texto, porque com arquivo a maioria dos
  destinos descarta o `url` separado.
- **Copiar link** tenta a Clipboard API, depois `execCommand("copy")`, e no último caso
  mostra o link selecionado num campo, para tocar e segurar.

### A escolha é por capacidade

"Compartilhar" aparece onde `navigator.share` existe, não onde o user agent diz
"celular". O Chrome no Windows tem a folha do sistema e ganha o botão; o Firefox desktop não
tem e fica com WhatsApp e "Copiar link". O `ShareButton` do card segue a mesma regra num
botão só: folha do sistema onde existe, link `wa.me` onde não, e o rótulo diz qual é.

### A imagem não pode atrasar o clique

`navigator.share` só roda enquanto o gesto do clique está vivo (5 s no Chromium, medido; o
WebKit é mais estrito). Os botões começam a baixar a imagem no `pointerenter`, `focus` e
`pointerdown`, e o `share` espera a imagem no máximo 3 s. Se ela não chega (rede, CORS,
`404`), compartilha sem ela. Nada disso vira erro na tela: fechar a folha é
`"cancelled"`, não falha.

!!! tip "A imagem no mesmo domínio poupa CORS"
    O `useShare` baixa a imagem com `fetch`. Servida pelo backend atrás do mesmo nginx
    (`/s/<id>/og.png`, `/api/caronas/<id>/moldura.png`), ela é same-origin e não precisa
    de cabeçalho CORS. Se o backend responde noutro domínio, o `CORSMiddleware` dele
    precisa liberar a origem do app, senão o `fetch` falha e a folha abre sem a imagem.

### `?v=`: dois caches, uma chave

O robô do WhatsApp guarda o que buscou, e a chave desse cache é a URL. A página `/s/42`
publica a imagem como `/s/42/og.png?v=<hash da versão>`: a carona mudou, o `version` do
resolver mudou, a URL da imagem mudou, e para a rede é outra imagem. O backend calcula esse
hash sozinho; o front não precisa saber dele.

O front tem o próprio cache: o navegador guarda o `og.png` por 10 minutos
(`max-age=600`). Por isso o `ridePreviewImageUrl` e o `rideFrameUrl` também levam
`?v=<updatedAt>`: o motorista edita o horário, volta à tela e compartilha a imagem nova,
não a guardada. O backend ignora o valor do `v` na rota; ele só muda a URL.

Para forçar o WhatsApp a reler um link **já** compartilhado não há botão: o cache é dele.
No Facebook, o [Sharing Debugger](https://developers.facebook.com/tools/debug/) tem
"Scrape Again".

### A moldura: arquivo onde dá, download onde não

A moldura é a imagem que a pessoa posta. O caminho depende do que o aparelho aceita, e
`useShare` já responde isso em `canShareFiles`:

- **Com `canShareFiles`**, o botão chama `share` com `imageUrl` apontando para a moldura.
  O PNG vai como arquivo, com o link no texto. O `imageFileName` dá um nome com extensão
  (`carona-42-story.png`): é pela extensão que o Chromium decide se o arquivo é
  compartilhável.
- **Sem `canShareFiles`** (Firefox desktop, Chrome no Linux), o botão vira um
  `<a href download>` para o mesmo PNG. Sendo same-origin, o navegador salva com o nome
  de `download` em vez de abrir a imagem numa aba.

Se o download da moldura falha no caminho do arquivo, o `share` segue com o texto e o
link, sem a imagem: a pessoa ainda divulga a carona, e a prévia do link continua
mostrando o card.

!!! tip "Já tem o PNG em mãos?"
    Para um `Blob` que o app já tem (gerado no browser, por exemplo), o
    [`shareOrDownloadBlob`](../share.md#exportar-um-arquivo-shareordownloadblob) faz as duas metades numa chamada: folha do
    sistema com o arquivo onde dá, download onde não.

### O QR aponta para `/s/{id}`

O QR do backend leva ao **link de compartilhamento**, não à tela do app. Quem escaneia cai
na página, que leva ao app; o mesmo link, colado no WhatsApp, mostra a prévia com o card.
O backend gera o QR no nível de correção `H` com o logo no centro, num tamanho medido para
continuar lendo. O [`QRCode`](../components/utility.md#qrcode) do SDK desenha um QR no
browser, sem logo: serve quando o link não tem marca para carregar.

## Recap

- ✅ A prévia vem das tags Open Graph de `/s/<id>`, servidas pelo `make_share_router` do
  `tempest-fastapi-sdk` 0.371.0, com `og:image` absoluta (`public_url` da configuração).
- ✅ O nginx encaminha `^~ /s/` e `^~ /api/`; sem o `^~`, o bloco de estáticos engole o
  `og.png` e a prévia sai sem imagem. Confira com `curl -sI …/s/42/og.png`.
- ✅ `?v=` muda a URL da imagem quando a carona muda: o backend faz isso no `og:image`, e
  o front faz no `imageUrl` para não reler o cache do navegador.
- ✅ `ShareActions` dá WhatsApp (`wa.me/?text=`), folha do sistema com a imagem anexada e
  "Copiar link" com fallback até o campo selecionado; `ShareButton` é o botão único do
  card.
- ✅ A moldura vai como arquivo por `useShare` onde há `canShareFiles`, e como
  `<a download>` onde não há. O QR aponta para `/s/<id>`.
- ✅ Textos traduzíveis por `tempest.share.*`; cancelar não é erro.
