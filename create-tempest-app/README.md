# create-tempest-app

Scaffold a [Tempest](https://www.npmjs.com/package/tempest-react-sdk) React app in one command.

```bash
npm create tempest-app my-app
# or: npx create-tempest-app my-app
# or: pnpm create tempest-app my-app
```

Then:

```bash
cd my-app
npm install
npm run dev
```

## What you get

A ready-to-run Vite + React + TypeScript project pre-wired with `tempest-react-sdk`:

- **Vite** with the `@` → `src` alias via `createViteConfig`
- **React Router v7** declarative routing (`defineRoutes` + `<AppRouter>`, lazy + guards)
- **Zustand** persisted auth store (`createAuthStore` + `createSelectors`)
- **TanStack Query** cache, theme and error boundary composed by `<AppProviders>`
- A typed HTTP client (`createApiClient`) reading the bearer token from the store

## Usage

```text
create-tempest-app [project-name]
```

If you omit `project-name` you'll be prompted. The target directory must not exist or must be empty.

See the [tempest-react-sdk docs](https://github.com/mauriciobenjamin700/tempest-react-sdk) for the full API.
