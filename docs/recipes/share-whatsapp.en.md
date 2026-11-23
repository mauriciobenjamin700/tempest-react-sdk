# Share with a WhatsApp preview

A BusCar driver published a ride Picos → Teresina for Friday at 07:05 and wants to
**spread it** in the town's group. They tap "Share", pick the group, and the message
arrives with the **preview card**: the ride's image, the title and the link that goes
straight to booking. On a laptop with no system share sheet, the same button opens
WhatsApp Web with the text ready. 📣

There are two halves. The **frontend** half is the button, and the SDK ships it ready.
The **backend** half is the page WhatsApp's crawler reads to build the preview — without
it, the link arrives bare.

!!! info "Before you start"
    Installation in [manual install](../index.md#manual-install). The server
    side follows the contract of a FastAPI service on `tempest-fastapi-sdk`: the share page
    with Open Graph tags and the PNG preview card come ready from
    `tempest-fastapi-sdk[image]>=0.371.0` (`make_share_router`), as the
    [Share page](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/share-preview/) recipe shows; the QR code with a logo for
    the same link is in [QR with logo](https://mauriciobenjamin700.github.io/tempest-fastapi-sdk/en/recipes/qr-logo/).

## What we will build

- 📲 On a phone: the **system sheet** with the preview image attached, where the device
  accepts files.
- 💬 Without Web Share: the `wa.me/?text=…` link, which opens WhatsApp's **chat picker**
  with the text ready.
- 🔗 "Copy link" that works even inside Instagram's in-app browser.
- 🖼️ The preview (image, title, description) from the **Open Graph** tags of `/c/<id>`.
- 🧭 A share icon on the list card, and the three buttons on the ride screen.

## The code, file by file

### 1. The link and the text

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
  const day = ride.departure.toLocaleDateString("en", { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = ride.departure.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  const seats = ride.seats === 1 ? "1 seat" : `${ride.seats} seats`;
  return `🚗 Ride ${ride.origin} → ${ride.destination}\n${day} at ${time} · ${seats}`;
}
```

### 2. The buttons on the ride screen

```tsx
// src/features/rides/RideShare.tsx
import { ShareActions, useToast } from "tempest-react-sdk";
import { rideShareText, rideShareUrl, type Ride } from "@/lib/ride-share";

export function RideShare({ ride }: { ride: Ride }) {
  const toast = useToast();
  const url = rideShareUrl(ride);

  return (
    <ShareActions
      title={`Ride ${ride.origin} → ${ride.destination}`}
      text={rideShareText(ride)}
      url={url}
      imageUrl={`${url}/og.png`}
      onCopy={(copied) => copied && toast.success("Ride link copied")}
    />
  );
}
```

### 3. The icon on the list card

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
          labels={{ native: "Share the ride", whatsapp: "Spread the ride on WhatsApp" }}
          text={rideShareText(ride)}
          url={url}
          imageUrl={`${url}/og.png`}
        />
      }
    >
      {ride.seats} seats
    </Card>
  );
}
```

### 4. nginx forwards `/c/` to the backend

```nginx
# nginx.conf — inside the server { } that serves the app
location ^~ /c/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 5. What `/c/<id>` returns

The backend answers HTML with the tags the crawler reads, and sends the human on to the
app screen:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Ride Picos → Teresina</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Ride Picos → Teresina" />
    <meta property="og:description" content="Friday 07:05 · 3 seats" />
    <meta property="og:url" content="https://app.example.com/c/42" />
    <meta property="og:image" content="https://app.example.com/c/42/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="canonical" href="https://app.example.com/c/42" />
    <meta http-equiv="refresh" content="0; url=/rides/42" />
  </head>
  <body><a href="/rides/42">Open the ride</a></body>
</html>
```

## Piece by piece

### Why the preview belongs to the backend

WhatsApp builds the card by reading the **Open Graph** tags of the HTML the link returns,
and its crawler **does not run JavaScript**. A Vite SPA returns the same empty
`index.html` for every route, so there is no per-ride tag to read. That is why `/c/<id>`
is a backend page behind the same domain: nginx forwards the prefix there (`^~` beats the
static-files rule, which would catch `og.png`).

!!! warning "`og:image` must be an absolute URL"
    With a relative path most crawlers do not find the image. Use the public origin
    (`https://…`), at 1200×630, the size the large card expects.

### `ShareActions`: three paths, each where it works

- **WhatsApp** is an `<a>` to `wa.me/?text=…`, built by
  [`whatsAppShareUrl`](../br-pagamentos.md#spreading-without-a-recipient-whatsappshareurl).
  The text ends with the link (`ShareActions` appends it when the text does not have it
  yet), and that link is where WhatsApp takes the preview from. No number: WhatsApp itself
  asks which chat or group.
- **Share** opens the system sheet through [`useShare`](../share.md#useshare-sharing-with-an-image-and-a-fallback).
  Where the device accepts files, `og.png` goes **attached** — the image shows up even on a
  target that builds no preview — and the link moves into the text, because with a file
  most targets drop the separate `url`.
- **Copy link** tries the Clipboard API, then `execCommand("copy")`, and as the last
  resort shows the link selected in a field, to press and hold.

### The choice is by capability

"Share" renders where `navigator.share` exists — not where the user agent says "phone".
Chrome on Windows has the system sheet and gets the button; desktop Firefox does not and
keeps WhatsApp and "Copy link". The card's `ShareButton` follows the same rule in a single
button: system sheet where it exists, `wa.me` link where it does not — and the label says
which.

### The image must not delay the click

`navigator.share` only runs while the click's gesture is alive (5 s in Chromium, measured;
WebKit is stricter). The buttons start downloading `og.png` on `pointerenter`, `focus` and
`pointerdown`, and `share` waits at most 3 s for it. If it does not arrive — network,
CORS, 404 — it shares without it. None of that becomes an error on screen: closing the
sheet is `"cancelled"`, not a failure.

!!! tip "An image on the same domain spares you CORS"
    `useShare` downloads the image with `fetch`. Served by the backend behind the same
    nginx (`/c/<id>/og.png`), it is same-origin and needs no CORS header.

## Recap

- ✅ The preview comes from the Open Graph tags of a **backend** page (`/c/<id>`), with an
  absolute 1200×630 `og:image`; nginx forwards the prefix.
- ✅ `ShareActions` gives WhatsApp (`wa.me/?text=`), the system sheet with the image
  attached, and "Copy link" with a fallback down to the selected field.
- ✅ `ShareButton` is the card's single button: system sheet or `wa.me`, by capability.
- ✅ `whatsAppShareUrl(text)` (in `/br`) builds the recipient-less link.
- ✅ Texts translatable through `tempest.share.*`; cancelling is not an error.
