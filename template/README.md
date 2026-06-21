# Tempest App

Scaffolded with [`create-tempest-app`](https://www.npmjs.com/package/create-tempest-app) and powered by [`tempest-react-sdk`](https://www.npmjs.com/package/tempest-react-sdk).

## Stack

- **Vite** with the `@` → `src` alias (`tempest-react-sdk/vite` → `createViteConfig`)
- **React Router v7** declarative routing (`defineRoutes` + `<AppRouter>`)
- **Zustand** state (`createAuthStore` + `createSelectors`)
- **TanStack Query** cache (mounted by `<AppProviders>`)

## Getting started

```bash
npm install
cp .env.example .env   # adjust VITE_API_URL
npm run dev            # http://127.0.0.1:5173
```

## Layout

```text
src/
├── main.tsx              # mounts <App /> + SDK styles
├── App.tsx               # <AppProviders> + <AppRouter>
├── routes.tsx            # declarative route tree (lazy + guard)
├── layouts/RootLayout.tsx
├── pages/                # Home, Login, Dashboard (lazy + guarded)
├── stores/auth.ts        # persisted Zustand auth store
└── lib/api.ts            # typed HTTP client + query keys
```

## Next steps

- Add a route: drop a page in `src/pages/` and an entry in `src/routes.tsx`.
- Add state: `createStore<T>()` in `src/stores/`.
- Fetch data: `useQuery({ queryKey: queryKeys.me(), queryFn: () => api.get("/me") })`.
