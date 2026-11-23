# Recipes

Every recipe here starts from a **real situation**: a screen a production app
needs, with the states it really has (loading, empty, error, success, phone). Instead
of showing one component on its own, the recipe brings together the
`tempest-react-sdk` pieces that solve that screen and shows the code **file by
file**, complete, with its imports. You copy, paste and adapt. 🚀

!!! tip "Where to start"
    - **Never used the SDK?** Follow the **[Tutorial](../tutorial/index.md)** first:
      it builds one concept per page, and the recipes assume what it teaches.
    - **Need a screen like yours?** Pick a [use case](#use-cases) below.
    - **Want to see everything together in a whole app?** Go straight to the
      [integrated example](#integrated-example).
    - **Just one specific piece** (dark mode, ⌘K, a zod form)? The
      [quick recipes](#quick-recipes) are short.

!!! info "Common prerequisites"
    Every recipe assumes an app created by
    [`create-tempest-app`](../scaffold.md), or a Vite + React + TS app with the SDK
    installed and its CSS imported once in the entrypoint
    ([Manual installation](../index.md#manual-install)). When a recipe talks to
    a backend, the contract is that of a FastAPI service built on
    `tempest-fastapi-sdk`, described in [FastAPI integration](../integration-fastapi.md).

## How each recipe is written

Every page follows the same path, so you know where to look:

1. **The situation** — who uses the screen and what it has to do.
2. **What we will build** — the list of behaviours, including the error and
   small-screen states.
3. **The code, file by file** — each block is a whole file, with its path on the
   first line. Every block with an `import` is **compiled against the SDK** in the
   package's test suite, so the example does not fall behind when the API changes.
4. **Piece by piece** — why each piece is there.
5. **Recap** — what to take to your app.

## Use cases

| Recipe | The situation | Main pieces |
| --- | --- | --- |
| [CRUD admin panel](admin-crud.md) | A store's back office: list, search, filter, create, edit and delete records. | server-paginated table, zod form, overlay, toast, HTTP client and query |
| [BR sign-up + checkout](br-signup-checkout.md) | The customer signs up with CPF, CEP and phone and pays with Pix or card. | BR inputs, `MoneyInput`, CEP lookup, Pix and card checkout |
| [Live trip (map + WebSocket)](live-trip.md) | The driver and the passenger follow the trip on the map, in real time. | `LiveRouteMap`, `LiveRouteMapLegend`, WebSocket, road matching |
| [Real-time messenger](messenger.md) | A support chat with history, attachments and messages arriving live. | chat components, WebSocket, optimistic send, upload |
| [Share with a WhatsApp preview](share-whatsapp.md) | The driver spreads the ride in a group, and the message arrives with image, title and link; the QR frame goes as a file or is downloaded. | `ShareActions`, `ShareButton`, `useShare`, `whatsAppShareUrl`, `tempest-fastapi-sdk`'s `make_share_router` (`/s/{id}`) |
| [Offline field app](field-app-offline.md) | A technician records visits with no signal and syncs when the network comes back. | offline queue, photo capture, resumable upload, zip export |

## Integrated example

[**Management app**](example-management-app.md): a small, whole app, with sign-in,
role-protected routes, a layout with navigation, a dashboard with charts, a
records module and a settings screen. It is the place to see how the pieces of
the recipes above fit into a single project, from the folder tree to the last
file.

## Quick recipes

Short answers to an "I want to do X". They were the sections of the old
[Cookbook](../cookbook.md), now one per page:

- [Complete authentication flow](auth-flow.md)
- [Paginated list with search and sorting](search-list.md)
- [Form with zod validation](zod-form.md)
- [Dark mode without flash](dark-mode.md)
- [Offline-first](offline-first.md)
- [⌘K command palette](command-palette.md)
- [App from scratch in 1 minute](app-from-scratch.md)

## Full-stack with FastAPI

Two recipes span the frontend and the backend together:

- [FastAPI integration (full-stack)](../integration-fastapi.md): typed errors,
  `X-Request-ID`, `Retry-After`, pagination and authentication end to end.
- [Offline Sync (FastAPI)](../offline-sync.md): the SDK's offline queue talking to
  the backend's sync endpoint.

## Recap

- Recipe = **one real screen**, with all its states, complete code file by file.
- The examples **compile against the SDK** in the package's suite.
- Start with the [Tutorial](../tutorial/index.md), pick the use case closest to
  yours, and use the [integrated example](example-management-app.md) as the map of
  the whole app.
