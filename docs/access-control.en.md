# Access Control (RBAC)

**Permission and role** checks to hide or block actions a user can't perform. While [`AuthGuard`](./auth.md) only answers "are they logged in?", Access Control answers "can this user **delete a post**?" — `<resource>:<action>` granularity.

!!! info "Why does this exist beyond `AuthGuard`?"
    `AuthGuard` is binary: authenticated or not. But inside a logged-in app, an editor can create posts and a reader can't; an admin sees the delete button and the rest don't. Hiding those controls in the UI (and ideally blocking them in the backend) is RBAC's job. Access Control gives you a pluggable contract (`AccessControl`), a ready-made role-based strategy, and the UI utilities (`useCan`, `<Can>`) to tie it together.

!!! warning "Frontend RBAC is UX, not security"
    Hiding a button does **not** protect the endpoint. The authorization decision that matters happens in the backend (in the `tempest-fastapi-sdk`). Access Control here improves the experience — it avoids showing actions that would fail with a 403 — but the server remains the source of truth.

## When to use

- Hide/disable buttons and links based on permissions (`<Can>`).
- Branch logic by permission inside a component (`useCan`).
- Derive the user's permission set from the JWT (`permissionsFromToken`).

## Provider — `<AccessControlProvider>`

Wrap the app with `<AccessControlProvider control={…}>`, passing an `AccessControl` strategy. Every check (`useCan`, `<Can>`) reads from that strategy via context:

```tsx
import { AccessControlProvider, createRoleAccessControl } from "tempest-react-sdk";
import { App } from "./App";

const accessControl = createRoleAccessControl({
  role: "editor",
  roles: {
    editor: ["posts:create", "posts:update", "comments:read"],
    admin: ["*"],
  },
});

export function Root() {
  return (
    <AccessControlProvider control={accessControl}>
      <App />
    </AccessControlProvider>
  );
}
```

!!! note "No provider → allow all"
    If **no** `<AccessControlProvider>` sits above in the tree, `useCan`/`<Can>` treat every check as **allowed**. This keeps the SDK opt-in: you turn enforcement on by dropping in a provider, and off by removing it. Handy in dev or in apps without RBAC yet — components using `<Can>` keep working, they just don't block anything.

## `createRoleAccessControl`

Builds an RBAC strategy from a static permission set. The signature is `createRoleAccessControl({ permissions?, roles?, role? })`:

- `permissions` — strings granted directly, regardless of role.
- `roles` — a map of `role name → permissions` that role grants.
- `role` — the active role(s) (string or array). Their permissions (from `roles`) are merged in.

The effective set is `permissions` **plus**, for each active role in `role`, the permissions listed in `roles[role]`.

### Matching rules

Each permission is a `"<resource>:<action>"` string (e.g. `"posts:create"`) or a bare `"<action>"`. The wildcards:

| Granted permission | What it allows                                            |
| ------------------ | -------------------------------------------------------- |
| `"*"`              | **everything** — any action on any resource             |
| `"posts:*"`        | any action on the `posts` resource                      |
| `"posts:create"`   | exactly the `create` action on the `posts` resource     |
| `"export"`         | the global `export` action (a check **without** `resource`) |

```ts
import { createRoleAccessControl } from "tempest-react-sdk";

const ac = createRoleAccessControl({
  role: "editor",
  roles: { editor: ["posts:*", "comments:read"] },
});

ac.can({ action: "create", resource: "posts" }); // { can: true } — matches "posts:*"
ac.can({ action: "read", resource: "comments" }); // { can: true } — exact match
ac.can({ action: "delete", resource: "users" }); // { can: false, reason: "missing permission" }
```

!!! tip "Combine `permissions` and `roles`"
    `permissions` is for direct grants (a one-off override on a specific user), `roles` + `role` is for the common role-based case. The two add up — a direct permission applies even if no role grants it.

## `permissionsFromToken` — permissions from the JWT

Instead of maintaining the permission list by hand, derive it from the user's JWT. `permissionsFromToken(token, { claim })`:

- Reads the configured claim (default `"permissions"`).
- If absent, falls back to the OAuth `"scopes"` then `"scope"` claims.
- Array claims are used as-is; string claims are split on whitespace (the OAuth `scope` convention).
- Returns `[]` on any decode failure or when no recognizable claim is present.

```ts
import { createRoleAccessControl, permissionsFromToken } from "tempest-react-sdk";

const token = getAccessTokenFromSomewhere();

// Reads the "permissions" claim (default), falling back to "scopes"/"scope"
const permissions = permissionsFromToken(token);

const accessControl = createRoleAccessControl({ permissions });
```

!!! warning "`permissionsFromToken` does not verify the signature"
    It only decodes the JWT payload (via `decodeJWT`) to read the claim — it does **not** verify the signature. It's defensive reading for UX, just like [`decodeJWT`](./auth.md). Trusting these permissions for real security is the backend's job.

For a custom claim (e.g. the backend emits `"perms"`):

```ts
const permissions = permissionsFromToken(token, { claim: "perms" });
```

## `useCan` — programmatic check

`useCan({ action, resource })` resolves the check against the strategy in context and returns `{ allowed, isLoading, reason }`. It works with a synchronous `can` (boolean or `CanResult`) and with a `Promise` (remote policies), re-running whenever the params change:

```tsx
import { useCan } from "tempest-react-sdk";

export function PostActions({ postId }: { postId: string }) {
  const { allowed, isLoading } = useCan({ action: "update", resource: "posts" });

  if (isLoading) return null; // async check in flight

  return (
    <button disabled={!allowed} onClick={() => editPost(postId)}>
      Edit
    </button>
  );
}
```

!!! note "`reason` explains the `false`"
    When `allowed` is `false`, `reason` usually carries why (`"missing permission"` from `createRoleAccessControl`, or the error message from an async policy that rejected). Useful for a tooltip ("You don't have permission to X") instead of just hiding.

## `<Can>` — conditional render

`<Can action resource fallback>` renders `children` when the action is allowed, otherwise the `fallback` (or nothing). While an async check is pending, it renders the `fallback` (or nothing):

```tsx
import { Can } from "tempest-react-sdk";

<Can action="create" resource="posts" fallback={<p>No permission to create.</p>}>
  <NewPostButton />
</Can>;
```

## Complete example — a gated "Delete" button

Everything together: derive permissions from the JWT, configure the strategy, and gate the delete action both by render (`<Can>`) and by disabled state (`useCan`):

```tsx
import {
  AccessControlProvider,
  Can,
  createRoleAccessControl,
  permissionsFromToken,
  useCan,
} from "tempest-react-sdk";

// 1. Strategy derived from the logged-in user's JWT.
function buildAccessControl(token: string) {
  return createRoleAccessControl({
    // e.g. token with { permissions: ["posts:read", "posts:delete"] }
    permissions: permissionsFromToken(token),
  });
}

// 2. Provider at the top of the app.
export function Root({ token }: { token: string }) {
  return (
    <AccessControlProvider control={buildAccessControl(token)}>
      <PostRow id="post-1" title="Hello world" />
    </AccessControlProvider>
  );
}

// 3a. Hide the action entirely with <Can>.
function PostRow({ id, title }: { id: string; title: string }) {
  return (
    <div>
      <span>{title}</span>
      <Can action="delete" resource="posts" fallback={null}>
        <DeleteButton id={id} />
      </Can>
    </div>
  );
}

// 3b. Always show, but disable + explain with useCan.
function DeleteButton({ id }: { id: string }) {
  const { allowed, isLoading, reason } = useCan({ action: "delete", resource: "posts" });

  return (
    <button
      disabled={!allowed || isLoading}
      title={allowed ? "Delete post" : reason}
      onClick={() => deletePost(id)}
    >
      Delete
    </button>
  );
}
```

!!! tip "`<Can>` hides; `useCan` disables"
    Use `<Can>` when the action simply shouldn't exist for those who can't perform it (clean UI). Use `useCan` when you want to keep the control visible but inert, with a `title`/tooltip explaining why — useful for discoverability ("this exists, but needs another role").

## Recap

- `<AccessControlProvider control={…}>` injects an `AccessControl` strategy; **with no provider, every check allows** (opt-in).
- `createRoleAccessControl({ permissions, roles, role })` builds static RBAC; matching by `"<resource>:<action>"`, with wildcards `"*"` (everything) and `"<resource>:*"` (whole resource).
- `permissionsFromToken(token, { claim })` reads permissions from the JWT (default claim `"permissions"`, fallback `"scopes"`/`"scope"`); it does not verify the signature.
- `useCan({ action, resource })` → `{ allowed, isLoading, reason }`, supporting both sync and async checks.
- `<Can action resource fallback>` hides UI; `useCan` disables and explains with `reason`.
- Frontend RBAC is UX — the backend remains the source of truth for authorization.

## See also

- [Auth + Guard](./auth.md) — `AuthGuard` (authenticated?) and `decodeJWT`/`isJWTExpired`
- [Data Provider](./data-provider.md) — gate CRUD actions by role/permission
