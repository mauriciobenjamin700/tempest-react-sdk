# Tempest App (PWA)

Scaffolded with [`create-tempest-app --pwa`](https://www.npmjs.com/package/tempest-react-sdk) and powered by [`tempest-react-sdk`](https://www.npmjs.com/package/tempest-react-sdk).

## Stack

- **Vite** with the `@` → `src` alias (`tempest-react-sdk/vite` → `createViteConfig`)
- **React Router v7** declarative routing (`defineRoutes` + `<AppRouter>`)
- **Zustand** state (`createAuthStore` + `createSelectors`)
- **TanStack Query** cache (mounted by `<AppProviders>`)
- **PWA**: installable manifest + a service worker built from `tempest-react-sdk/sw`, with web-push wiring

## Getting started

```bash
npm install
cp .env.example .env   # adjust VITE_API_URL + VITE_VAPID_PUBLIC_KEY
npm run dev            # http://127.0.0.1:5173
```

## PWA layout

```text
public/manifest.webmanifest   # install metadata (name, icons, theme color)
public/icon.svg               # app icon (replace with your brand; PNG 192/512 recommended)
src/sw.ts                     # service worker — push + notificationclick + skip-waiting
vite.sw.config.ts             # bundles src/sw.ts → dist/sw.js (classic worker)
index.html                    # manifest link + theme-color + apple meta tags
src/main.tsx                  # registers /sw.js in production, cleans up SW in dev
src/pages/Dashboard.tsx       # Install button + push notifications toggle
```

## How it works

- **Install**: `index.html` links the manifest; `useBeforeInstallPrompt` (in
  `Dashboard.tsx`) surfaces a custom Install button when the browser offers one.
- **Service worker**: `src/sw.ts` imports `installPushHandler`,
  `installNotificationClickHandler` and `installSkipWaitingListener` from
  `tempest-react-sdk/sw`. `npm run build` bundles it to `dist/sw.js` via
  `vite.sw.config.ts`, and `src/main.tsx` registers it in production.
- **Web push**: `usePushSubscription` reads `VITE_VAPID_PUBLIC_KEY`, subscribes
  through the active service worker, and hands the subscription to your
  `onSubscribe` callback to POST to your backend.

> ⚠️ The service worker is bundled at **build time**, so push and offline behave
> only in a production build. Test them with:
>
> ```bash
> npm run build && npm run preview
> ```
>
> In `npm run dev` the worker is intentionally unregistered to avoid stale caches.

## Replace the icons

`public/icon.svg` is a placeholder. For guaranteed installability across all
browsers, add PNG icons (192×192 and 512×512) to `public/` and point the
`manifest.webmanifest` `icons` entries at them.

## Next steps

- Add a route: drop a page in `src/pages/` and an entry in `src/routes.tsx`.
- Fetch data: `useQuery({ queryKey: queryKeys.me(), queryFn: () => api.get("/me") })`.
- Generate VAPID keys on your backend and set `VITE_VAPID_PUBLIC_KEY` in `.env`.
