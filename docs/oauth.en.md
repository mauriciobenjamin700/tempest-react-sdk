# OAuth (Google)

The `oauth` module covers **both ends** of a social login: the button the user clicks (`<GoogleSignIn>`) and the callback route that swaps the provider credential for a session from your API (`useOAuthCallback`).

!!! info "Why wrap `@react-oauth/google`?"
    Two pains. First, Google's success payload arrives as `{ credential?: string }` — optional, so every call site has to check for the empty case, and `onError` receives no argument at all. Second, if the SDK declared `@react-oauth/google` as a peer dep, **every** app installing `tempest-react-sdk` would pay for it, including the ones with no social login. The wrapper solves both: it normalises success/failure into `OAuthCredential`/`OAuthError`, and you pass `GoogleLogin` through the `component` prop.

## Install the Google SDK

`@react-oauth/google` belongs to **your app**, not to the SDK:

```bash
npm install @react-oauth/google
```

## The button: `<GoogleSignIn>`

A complete, copy-pasteable program:

```tsx
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { GoogleSignIn } from "tempest-react-sdk";

export function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <GoogleSignIn
        component={GoogleLogin}
        locale="en-US"
        text="continue_with"
        onSuccess={async ({ idToken }) => {
          await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id_token: idToken }),
          });
        }}
        onError={(error) => console.error(error.message)}
      />
    </GoogleOAuthProvider>
  );
}
```

Piece by piece:

1. `GoogleOAuthProvider` (from `@react-oauth/google`) loads Google's script and injects the `clientId`. It wraps **around**, usually at the top of the tree or just on the login page.
2. `component={GoogleLogin}` is the dependency injection — that is how the SDK renders Google's official button without depending on it.
3. `onSuccess` receives an already-validated `OAuthCredential`: if Google returns a response with no `credential`, the wrapper calls `onError` and does **not** call `onSuccess`. You never deal with an empty `idToken`.
4. `onError` receives an `OAuthError` with `provider` and `message` filled in.

### Props

| Prop            | Type                                                            | Description                                                          |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `component`     | `(props) => ReactNode`                                          | **Required.** The `GoogleLogin` imported by your app.                |
| `onSuccess`     | `(c: OAuthCredential) => void \| Promise`                       | **Required.** Receives `{ idToken, provider, raw }`.                 |
| `onError`       | `(e: OAuthError) => void`                                       | Normalised error (including the "no credential" case).               |
| `locale`        | `string`                                                        | Button language (e.g. `"pt-BR"`). Defaults to the browser locale.    |
| `theme`         | `"filled_blue" \| "filled_black" \| "outline"`                  | Visual theme passed through to Google.                               |
| `text`          | `"signin_with" \| "signup_with" \| "continue_with" \| "signin"` | Button copy.                                                         |
| `shape`         | `"rectangular" \| "pill" \| "circle" \| "square"`               | Button shape.                                                        |
| `size`          | `"large" \| "medium" \| "small"`                                | Size.                                                               |
| `disableOneTap` | `boolean`                                                       | Turns off the "One Tap" auto-prompt. Default `false` (One Tap **on**). |
| `width`         | `number`                                                        | Width in px — Google's button is fixed-width by default.             |
| `className`     | `string`                                                        | Applied to the wrapper.                                              |
| `style`         | `CSSProperties`                                                 | Applied to the wrapper.                                              |

!!! warning "One Tap ships enabled"
    `disableOneTap` defaults to `false`, so the SDK passes `useOneTap: true` to Google. If you don't want the prompt popping up on its own in the corner (common on pages that aren't the login screen), pass `disableOneTap`.

### What reaches `onSuccess` / `onError`

```ts
interface OAuthCredential {
  idToken: string; // provider JWT — send it to your backend to validate
  provider: string; // "google"
  raw?: unknown; // raw response from the provider SDK
}

interface OAuthError {
  provider: string;
  code?: string;
  message: string;
  raw?: unknown;
}
```

!!! danger "Never trust the `idToken` on the client"
    The `idToken` is a JWT signed by Google, but **signature validation** must happen on your backend (against Google's public keys), checking `aud` (your `clientId`) and `iss`. Decoding it on the client with `decodeJWT` is fine for UI (showing a name or picture) — never for authorisation.

## The callback route: `useOAuthCallback`

When the flow is a **redirect** (the provider comes back to `/callback?code=…`) rather than a popup, you need to exchange that code for a session — exactly once.

```tsx
import { useNavigate } from "tempest-react-sdk";
import { ErrorState, Spinner, useOAuthCallback } from "tempest-react-sdk";

interface Session {
  token: string;
  user: { id: string; name: string };
}

export function OAuthCallbackPage() {
  const navigate = useNavigate();

  const { loading, error } = useOAuthCallback<Session>({
    exchange: async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) throw new Error("missing code");
      const response = await fetch("/api/auth/google/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error("exchange failed");
      return (await response.json()) as Session;
    },
    onSuccess: () => navigate("/dashboard", { replace: true }),
    onError: () => navigate("/login?error=oauth", { replace: true }),
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState description="We could not finish signing you in." />;
  return null;
}
```

The result: while the POST is in flight you get the spinner; on resolve the hook calls `onSuccess` and you redirect; on failure `onError` sends the user back to login with an error flag.

!!! check "Runs once, even under StrictMode"
    In development React 18/19 mounts every component twice on purpose. Without a guard, `exchange` would fire two POSTs and the second would fail — OAuth codes are single-use. The hook uses a `ref` to guarantee a single run, so you never see the phantom "code already redeemed" error in dev.

### Return value

| Field     | Type                                | Meaning                              |
| --------- | ----------------------------------- | ------------------------------------ |
| `loading` | `boolean`                           | `true` while `exchange` is pending   |
| `data`    | `T \| null`                         | Resolved value, on success           |
| `error`   | `unknown`                           | Rejection reason, on failure         |
| `status`  | `"pending" \| "success" \| "error"` | Aggregated state                     |

!!! tip "`exchange` only has to be a Promise"
    The hook knows nothing about OAuth — it runs one async function once and exposes the state. It fits any "callback becomes a session" exchange: magic links, corporate SSO, email confirmation.

## Closing the loop with `auth`

The natural pair is [`createAuthStore`](auth.en.md): `onSuccess` stores the session, and from then on `AuthGuard` and `createApiClient` see a logged-in user.

```tsx
const { loading } = useOAuthCallback<Session>({
  exchange: () => api.post<Session>("/auth/google/exchange", { body: { code } }),
  onSuccess: ({ token, user }) => {
    useAuthStore.getState().setSession({ token, user });
    navigate("/dashboard", { replace: true });
  },
});
```

## Recap

- `@react-oauth/google` is **your** app's dependency; the SDK only receives `GoogleLogin` through the `component` prop.
- `<GoogleSignIn>` normalises success and failure — `onSuccess` only runs with an `idToken` present.
- One Tap ships **enabled**; turn it off with `disableOneTap` where it doesn't belong.
- Validating the `idToken` is always the backend's job.
- `useOAuthCallback` runs the exchange exactly once (StrictMode-proof) and returns `loading`/`data`/`error`/`status`.
- It pairs with [`auth`](auth.en.md) to store the session and [`routing`](routing.en.md) to redirect.
