# Share with a WhatsApp preview

A BusCar driver published a ride Picos → Teresina for Friday at 07:05 and wants to
**spread it** in the town's group. They tap "Share", pick the group, and the message
arrives with the **preview card**: the ride's image, the title and the link that goes
straight to booking. On a laptop with no system share sheet, the same button opens
WhatsApp Web with the text ready. And, for the status or the car window, they download the
**frame**: an image with their photo, the route and a QR code that leads to the same
link. 📣

There are two halves. The **frontend** half is the buttons, and the SDK ships them ready.
The **backend** half is the page WhatsApp's crawler reads to build the preview, the PNG
card, the QR and the frame. Without it, the link arrives bare.

!!! info "Before you start"
    Installation in [manual install](../index.md#manual-install). The backend is a FastAPI
    service with `tempest-fastapi-sdk[image]>=0.371.0`. This recipe shows only what the
    frontend needs to know about it; the depth (resolver, card, `ETag`, font in Docker)
    is in the `tempest-fastapi-sdk` recipes
    [Share with a preview](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/share-preview/)
    and [QR code with a logo and frame](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/qr-logo/).

## What we will build

- 📲 On a phone: the **system sheet** with the preview image attached, where the device
  accepts files.
- 💬 Without Web Share: the `wa.me/?text=…` link, which opens WhatsApp's **chat picker**
  with the text ready.
- 🔗 "Copy link" that works even inside Instagram's in-app browser.
- 🖼️ The preview (image, title, description) from the **Open Graph** tags of `/s/<id>`,
  served by the backend's `make_share_router`.
- 🔳 The ride's **QR code** on screen, and the **frame** (vertical for the status, square
  for chats) shared as a file where possible, and downloaded where not.
- 🧭 A share icon on the list card, and the three buttons on the ride screen.

## The code, file by file

### 1. The links and the text

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
  const day = ride.departure.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = ride.departure.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const seats = ride.seats === 1 ? "1 seat" : `${ride.seats} seats`;
  return `🚗 Ride ${ride.origin} → ${ride.destination}\n${day} at ${time} · ${seats}`;
}
```

### 2. The buttons on the ride screen

```tsx
// src/features/rides/RideShare.tsx
import { ShareActions, useToast } from "tempest-react-sdk";
import { ridePreviewImageUrl, rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideShare({ ride }: { ride: Ride }) {
  const toast = useToast();

  return (
    <ShareActions
      title={`Ride ${ride.origin} → ${ride.destination}`}
      text={rideShareText(ride)}
      url={rideShareUrl(ride)}
      imageUrl={ridePreviewImageUrl(ride)}
      onCopy={(copied) => copied && toast.success("Ride link copied")}
    />
  );
}
```

### 3. The icon on the list card

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
          labels={{ native: "Share the ride", whatsapp: "Spread the ride on WhatsApp" }}
          text={rideShareText(ride)}
          url={rideShareUrl(ride)}
          imageUrl={ridePreviewImageUrl(ride)}
        />
      }
    >
      {ride.seats} seats
    </Card>
  );
}
```

### 4. The QR code and the frame

```tsx
// src/features/rides/RideFrame.tsx
import { Button, Image, useShare } from "tempest-react-sdk";
import { rideFrameUrl, rideQrUrl, rideShareText, rideShareUrl, type FrameLayout, type Ride } from "@/lib/ride-share";

const LAYOUTS: ReadonlyArray<{ layout: FrameLayout; label: string }> = [
  { layout: "story", label: "for the status" },
  { layout: "square", label: "for a chat" },
];

export function RideFrame({ ride }: { ride: Ride }) {
  const { canShareFiles, share, prefetchImage } = useShare();

  return (
    <section>
      <Image
        src={rideQrUrl(ride)}
        alt={`QR code of the ride ${ride.origin} → ${ride.destination}`}
        width={240}
        height={240}
      />
      {LAYOUTS.map(({ layout, label }) => {
        const imageUrl = rideFrameUrl(ride, layout);
        const imageFileName = `ride-${ride.id}-${layout}.png`;
        if (!canShareFiles) {
          return (
            <Button key={layout} variant="outline" href={imageUrl} download={imageFileName}>
              Download the image {label}
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
            Share the image {label}
          </Button>
        );
      })}
    </section>
  );
}
```

### 5. The backend: `make_share_router`

On the server, `/s/{id}` is answered by `make_share_router`. You write the resolver, which
says what to show for each ride, and it takes care of the HTML, the card and the cache.
Condensed from the [backend recipe](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/share-preview/):

```python
app.include_router(
    make_share_router(
        resolve_trip,
        public_url=settings.PUBLIC_URL,
        fallback=SharePreviewSchema(
            title="BusCar",
            description="Rides between cities",
            redirect_url="https://app.example.com",
        ),
        renderer=ShareCardRenderer(background=("#0b3d91", "#061f4a"), accent_color="#ffd166"),
        site_name="BusCar",
        locale="en_US",
        link_text="Open in the app",
    )
)
```

That registers two routes, both `GET` and `HEAD` and out of OpenAPI:

| Route | What it returns |
| --- | --- |
| `GET /s/{id}` | HTML with `og:title`, `og:description`, `og:image` (with `?v=`), `og:url`, `twitter:card`, `<link rel=canonical>`; the person moves on to `redirect_url` through `<meta http-equiv=refresh>` and a visible link |
| `GET /s/{id}/og.png` | the 1200×630 card, with a weak `ETag`, `304` and `Cache-Control: public, max-age=600` |

The QR and the frame are **not** `make_share_router` routes: they are two ride routes your
service writes with `render_qr(url, logo=...)` and
`ShareFrameRenderer.render(ShareFrameSchema(url=...), layout=..., photo=...)`, as the
[QR recipe](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/qr-logo/)
shows. In this recipe they live under `/api` (`/api/caronas/{id}/qr.png` and
`/api/caronas/{id}/moldura.png?layout=story|square`), and both draw the QR pointing to
`/s/{id}`.

### 6. nginx forwards `/s/` and `/api/` to the backend

```nginx
# nginx.conf — inside the server { } that serves the app
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

With the link served from the app's domain, the backend's `public_url` is that domain
(`https://app.example.com`), because that is what shows in the link.

If instead of nginx the backend itself serves the SPA with `make_spa_router`, include
`make_share_router` **before** it: FastAPI matches routes in registration order, and the
SPA fallback would answer `/s/42` with `index.html`.

### 7. Check with `curl`

Make the request the crawler makes, through the public domain:

```bash
curl -s https://app.example.com/s/42 | grep -E 'property="og:|twitter:card'
curl -sI https://app.example.com/s/42/og.png
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://app.example.com/api/caronas/42/moldura.png?layout=square"
```

The first lists the tags, with `og:image` ending in `/s/42/og.png?v=…`. The second must
give `200`, `content-type: image/png` and an `etag: W/"…"`. A `404` there while `/s/42`
answers `200` is nginx's static block catching the `.png`: the `^~` is missing.

## Piece by piece

### Why the preview belongs to the backend

WhatsApp builds the card by reading the **Open Graph** tags of the HTML the link returns,
and its crawler **does not run JavaScript**. A Vite SPA returns the same empty
`index.html` for every route, so there is no per-ride tag to read. That is why `/s/<id>`
is a backend page, behind the same domain.

A ride that was deleted, made private or sold out still answers `200`: the resolver
returns `None` and the page shows the `fallback`, with no `og:image` and without telling
what the ride was. Its `og.png` answers `404`, and `useShare` shares without the image.

### The `^~` is not decoration

nginx first picks the longest prefix, but then tries the **regex** rules, and the first
that matches wins. A Vite app almost always has a regex rule for static files
(`\.(js|css|png…)$`), and it matches `/s/42/og.png`. Measured with `nginx:alpine` in front
of `tempest-fastapi-sdk` 0.371.0, with the static block above (`docker run --network host`
with the `nginx.conf` from step 6, each path read with
`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088<path>`, on 2026-11-23):

| Block | `/s/42` | `/s/42/og.png` | `/api/caronas/42/moldura.png` |
| --- | --- | --- | --- |
| `location /s/`, `location /api/` | `200` | `404` | `404` |
| `location ^~ /s/`, `location ^~ /api/` | `200` | `200` | `200` |

Without the `^~`, the page comes out right and the image vanishes, with no error anywhere:
the crawler simply builds the preview without an image. The `^~` tells nginx that, once
this prefix matches, the regexes are not even tried.

For the same reason, the QR and the frame live under `/api/`, not at
`/caronas/42/qr.png`: that path belongs to the SPA and never reaches the backend. In the
same measurement it gave `404` (the static block caught the `.png`); without that block,
`try_files … /index.html` would return the app's HTML instead of the PNG.

### `public_url` comes from configuration

`make_share_router` does not build URLs from the request's `Host`: behind nginx it would
be the internal address (`http://backend:8000`), and the client picks the `Host`.
`og:image` must be **absolute** and public, because the crawler does not resolve a
relative path. That is why `public_url` is required and comes from the service's
configuration.

### `ShareActions`: three paths, each where it works

- **WhatsApp** is an `<a>` to `wa.me/?text=…`, built by
  [`whatsAppShareUrl`](../br-pagamentos.md#spreading-without-a-recipient-whatsappshareurl).
  The text ends with the link (`ShareActions` appends it if the text does not have it
  yet), and WhatsApp takes the preview from that link. No number: WhatsApp itself asks
  which chat or group.
- **Share** opens the system sheet through [`useShare`](../share.md#useshare-sharing-with-an-image-and-a-fallback).
  Where the device accepts files, the `og.png` goes **attached** (the image shows even on
  a target that builds no preview) and the link goes into the text, because with a file
  most targets drop the separate `url`.
- **Copy link** tries the Clipboard API, then `execCommand("copy")`, and as a last resort
  shows the link selected in a field, to long-press.

### The choice is by capability

"Share" shows where `navigator.share` exists, not where the user agent says "mobile".
Chrome on Windows has the system sheet and gets the button; desktop Firefox does not and
keeps WhatsApp and "Copy link". The card's `ShareButton` follows the same rule in a single
button: system sheet where it exists, the `wa.me` link where it does not, and the label
says which.

### The image must not delay the click

`navigator.share` only runs while the click's gesture is alive (5 s in Chromium, measured;
WebKit is stricter). The buttons start downloading the image on `pointerenter`, `focus`
and `pointerdown`, and `share` waits at most 3 s for it. If it does not arrive (network,
CORS, `404`), it shares without it. None of this becomes an on-screen error: closing the
sheet is `"cancelled"`, not a failure.

!!! tip "An image on the same domain spares you CORS"
    `useShare` downloads the image with `fetch`. Served by the backend behind the same
    nginx (`/s/<id>/og.png`, `/api/caronas/<id>/moldura.png`), it is same-origin and needs
    no CORS header. If the backend answers on another domain, its `CORSMiddleware` must
    allow the app's origin, otherwise the `fetch` fails and the sheet opens without the
    image.

### `?v=`: two caches, one key

WhatsApp's crawler keeps what it fetched, keyed by URL. The `/s/42` page publishes the
image as `/s/42/og.png?v=<version hash>`: the ride changed, the resolver's `version`
changed, the image URL changed, and for the network it is a different image. The backend
computes that hash on its own; the frontend does not need to know it.

The frontend has its own cache: the browser keeps `og.png` for 10 minutes
(`max-age=600`). That is why `ridePreviewImageUrl` and `rideFrameUrl` also carry
`?v=<updatedAt>`: the driver edits the time, returns to the screen and shares the new
image, not the cached one. The backend ignores the value of `v` in the route; it only
changes the URL.

To force WhatsApp to re-read a link that was **already** shared there is no button: the
cache is theirs. On Facebook, the
[Sharing Debugger](https://developers.facebook.com/tools/debug/) has "Scrape Again".

### The frame: a file where possible, a download where not

The frame is the image the person posts. The path depends on what the device accepts, and
`useShare` already answers that in `canShareFiles`:

- **With `canShareFiles`**, the button calls `share` with `imageUrl` pointing to the
  frame. The PNG goes as a file, with the link in the text. `imageFileName` gives a name
  with an extension (`ride-42-story.png`): Chromium decides by the extension whether the
  file is shareable.
- **Without `canShareFiles`** (desktop Firefox, Chrome on Linux), the button becomes an
  `<a href download>` to the same PNG. Being same-origin, the browser saves it under the
  `download` name instead of opening the image in a tab.

If downloading the frame fails on the file path, `share` goes on with the text and the
link, without the image: the person still spreads the ride, and the link's preview still
shows the card.

!!! tip "Already holding the PNG?"
    For a `Blob` the app already has (generated in the browser, for example),
    [`shareOrDownloadBlob`](../share.md#export-a-file-shareordownloadblob) does both
    halves in one call: system sheet with the file where possible, download where not.

### The QR points to `/s/{id}`

The backend's QR leads to the **share link**, not to the app screen. Whoever scans it
lands on the page, which leads to the app; the same link, pasted on WhatsApp, shows the
preview with the card. The backend generates the QR at error-correction level `H` with
the logo in the center, at a size measured to keep reading. The SDK's
[`QRCode`](../components/utility.md#qrcode) draws a QR in the browser, without a logo:
it fits when the link has no brand to carry.

## Recap

- ✅ The preview comes from the Open Graph tags of `/s/<id>`, served by
  `tempest-fastapi-sdk` 0.371.0's `make_share_router`, with an absolute `og:image`
  (`public_url` from configuration).
- ✅ nginx forwards `^~ /s/` and `^~ /api/`; without the `^~`, the static block swallows
  `og.png` and the preview comes out with no image. Check with `curl -sI …/s/42/og.png`.
- ✅ `?v=` changes the image URL when the ride changes: the backend does it on
  `og:image`, and the frontend does it on `imageUrl` so it does not re-read the browser
  cache.
- ✅ `ShareActions` gives WhatsApp (`wa.me/?text=`), the system sheet with the image
  attached and "Copy link" with a fallback down to the selected field; `ShareButton` is
  the card's single button.
- ✅ The frame goes as a file through `useShare` where there is `canShareFiles`, and as
  `<a download>` where there is not. The QR points to `/s/<id>`.
- ✅ Texts translatable through `tempest.share.*`; cancelling is not an error.
