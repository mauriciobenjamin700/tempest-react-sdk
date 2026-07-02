import { type ReactNode, useMemo, useState } from "react";
import {
    AccessControlProvider,
    Alert,
    AuthGuard,
    Badge,
    Button,
    Can,
    Card,
    createAuthStore,
    createRoleAccessControl,
    decodeJWT,
    Input,
    isJWTExpired,
    permissionsFromToken,
    useCan,
} from "tempest-react-sdk";
import { KeyRound, LogIn, LogOut, ShieldCheck, ShieldX } from "lucide-react";
import { Example } from "../Example";

/**
 * Shape of the user we keep in the demo auth store. Each real app owns its own
 * `TUser`; here we use a tiny one to show the typed store end-to-end.
 */
interface DemoUser {
    id: string;
    name: string;
    role: DemoRole;
}

/** Roles the access-control demos switch between. */
type DemoRole = "admin" | "editor" | "viewer";

/**
 * A self-contained auth store, created once at module scope. `createAuthStore`
 * calls Zustand `create()` internally, so it must live outside render to keep a
 * stable hook identity across re-renders. We disable persistence visually by
 * using a session key — the gallery is a demo, not a real session.
 */
const useDemoAuthStore = createAuthStore<DemoUser>({
    name: "gallery-auth-demo",
    storage: "session",
});

/** Base64url-encode a string the way JWT segments are encoded (no padding). */
function base64UrlEncode(value: string): string {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a FAKE, unsigned JWT entirely in the browser. The signature segment is a
 * literal placeholder — `decodeJWT`/`isJWTExpired`/`permissionsFromToken` only
 * read the payload, so they work on it, but it would never pass real signature
 * verification. For UX demos only; never authorize on the client.
 *
 * @param claims - Extra payload claims to embed (roles, permissions, exp, ...).
 * @returns A `header.payload.signature` string.
 */
function mintFakeJWT(claims: Record<string, unknown>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = base64UrlEncode(
        JSON.stringify({
            sub: "user-123",
            iat: nowSeconds,
            exp: nowSeconds + 3600,
            ...claims,
        }),
    );
    return `${header}.${payload}.fake-signature-not-verified`;
}

/** Pre-baked tokens per role, with a `permissions` claim for the RBAC demos. */
const ROLE_TOKENS: Record<DemoRole, string> = {
    admin: mintFakeJWT({
        name: "Ada (admin)",
        roles: ["admin"],
        permissions: ["*"],
    }),
    editor: mintFakeJWT({
        name: "Edu (editor)",
        roles: ["editor"],
        permissions: ["posts:create", "posts:update", "comments:read"],
    }),
    viewer: mintFakeJWT({
        name: "Vera (viewer)",
        roles: ["viewer"],
        permissions: ["posts:read", "comments:read"],
    }),
};

/** A fake token already expired one hour ago, for the `isJWTExpired` demo. */
const EXPIRED_TOKEN: string = (() => {
    const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = base64UrlEncode(
        JSON.stringify({ sub: "old", exp: Math.floor(Date.now() / 1000) - 3600 }),
    );
    return `${header}.${payload}.fake-signature-not-verified`;
})();

/** Demo 1 — store-backed login/logout gating with `createAuthStore` + `AuthGuard`. */
function StoreLoginDemo() {
    const user = useDemoAuthStore((s) => s.user);
    const isAuthenticated = useDemoAuthStore((s) => s.isAuthenticated);
    const setSession = useDemoAuthStore((s) => s.setSession);
    const logout = useDemoAuthStore((s) => s.logout);

    function handleLogin(): void {
        setSession({
            user: { id: "user-123", name: "Ada Lovelace", role: "admin" },
            token: ROLE_TOKENS.admin,
        });
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isAuthenticated ? (
                    <Button variant="ghost" onClick={logout}>
                        <LogOut size={16} /> Sair
                    </Button>
                ) : (
                    <Button onClick={handleLogin}>
                        <LogIn size={16} /> Entrar (mock)
                    </Button>
                )}
                <Badge variant={isAuthenticated ? "success" : "neutral"}>
                    {isAuthenticated ? `logado: ${user?.name}` : "deslogado"}
                </Badge>
            </div>

            <AuthGuard
                isAuthenticated={isAuthenticated}
                fallback={
                    <Alert variant="warning">Faça login para ver o conteúdo protegido.</Alert>
                }
            >
                <Card>
                    <ShieldCheck size={16} /> Conteúdo protegido — só visível autenticado.
                </Card>
            </AuthGuard>
        </div>
    );
}

/** Demo 2 — paste/mint a JWT and inspect it with `decodeJWT` + `isJWTExpired`. */
function JWTInspectorDemo() {
    const [token, setToken] = useState<string>(ROLE_TOKENS.editor);

    const decoded = useMemo<{ payload: Record<string, unknown>; error: string | null }>(() => {
        try {
            const { payload } = decodeJWT(token);
            return { payload, error: null };
        } catch (error: unknown) {
            return {
                payload: {},
                error: error instanceof Error ? error.message : "token inválido",
            };
        }
    }, [token]);

    const expired = useMemo<boolean>(() => isJWTExpired(token, 30), [token]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="ghost" onClick={() => setToken(ROLE_TOKENS.editor)}>
                    Token válido
                </Button>
                <Button variant="ghost" onClick={() => setToken(EXPIRED_TOKEN)}>
                    Token expirado
                </Button>
            </div>

            <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="cole um JWT (header.payload.signature)"
                aria-label="JWT"
            />

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>Status:</span>
                {expired ? (
                    <Badge variant="danger">
                        <ShieldX size={14} /> expirado
                    </Badge>
                ) : (
                    <Badge variant="success">
                        <ShieldCheck size={14} /> válido
                    </Badge>
                )}
            </div>

            {decoded.error ? (
                <Alert variant="danger">decodeJWT lançou: {decoded.error}</Alert>
            ) : (
                <pre
                    style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--tempest-color-surface-muted, #f4f4f5)",
                        overflowX: "auto",
                    }}
                >
                    <code>{JSON.stringify(decoded.payload, null, 2)}</code>
                </pre>
            )}
        </div>
    );
}

/** A single gated action button driven by `useCan`. */
function GatedAction({
    label,
    action,
    resource,
}: {
    label: string;
    action: string;
    resource?: string;
}): ReactNode {
    const { allowed, reason } = useCan({ action, resource });
    return (
        <Button
            variant="outline"
            disabled={!allowed}
            title={allowed ? `Permitido: ${resource ?? ""}:${action}` : reason}
        >
            {label}
        </Button>
    );
}

/**
 * Demo 3 — role switcher feeding `createRoleAccessControl` through
 * `AccessControlProvider`, with `<Can>` (hide) and `useCan` (disable) consumers.
 */
function RoleAccessDemo() {
    const [role, setRole] = useState<DemoRole>("editor");

    const control = useMemo(
        () =>
            createRoleAccessControl({
                role,
                roles: {
                    admin: ["*"],
                    editor: ["posts:create", "posts:update", "comments:read"],
                    viewer: ["posts:read", "comments:read"],
                },
            }),
        [role],
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["admin", "editor", "viewer"] as const).map((r) => (
                    <Button
                        key={r}
                        variant={r === role ? "primary" : "ghost"}
                        onClick={() => setRole(r)}
                    >
                        {r}
                    </Button>
                ))}
            </div>

            <AccessControlProvider control={control}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* useCan → keep visible but disabled, with a reason tooltip. */}
                    <GatedAction label="Criar post" action="create" resource="posts" />
                    <GatedAction label="Editar post" action="update" resource="posts" />
                    <GatedAction label="Excluir post" action="delete" resource="posts" />

                    {/* <Can> → hide the action entirely when denied. */}
                    <Can
                        action="delete"
                        resource="users"
                        fallback={<Badge variant="neutral">excluir usuário: oculto</Badge>}
                    >
                        <Button variant="danger">Excluir usuário</Button>
                    </Can>
                </div>
            </AccessControlProvider>
        </div>
    );
}

/** Demo 4 — derive a permission list from the fake token's claims. */
function PermissionsFromTokenDemo() {
    const [role, setRole] = useState<DemoRole>("editor");
    const token = ROLE_TOKENS[role];
    const permissions = useMemo<string[]>(() => permissionsFromToken(token), [token]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["admin", "editor", "viewer"] as const).map((r) => (
                    <Button
                        key={r}
                        variant={r === role ? "primary" : "ghost"}
                        onClick={() => setRole(r)}
                    >
                        {r}
                    </Button>
                ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <KeyRound size={16} />
                {permissions.length === 0 ? (
                    <Badge variant="neutral">sem permissões</Badge>
                ) : (
                    permissions.map((p) => (
                        <Badge key={p} variant="info">
                            {p}
                        </Badge>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Recipe section: authentication (store, guard, JWT) and access control (RBAC)
 * wired together with a fully in-browser fake JWT — no backend required.
 */
export function AuthAccessRecipeSection() {
    return (
        <section className="gallery-section" id="recipe-auth">
            <h3>Auth & Access Control (receita)</h3>
            <p className="description">
                Login com store, gate de rota, leitura de JWT e RBAC — tudo no navegador, sem
                backend. Os tokens são JWTs falsos (não assinados) gerados na hora; servem só para
                UX. Autorização de verdade é sempre no servidor.
            </p>

            <Example
                id="ex-auth-store"
                title="createAuthStore — login/logout com AuthGuard"
                note="O store Zustand guarda user+token; AuthGuard libera o conteúdo protegido."
                code={`const useAuthStore = createAuthStore<DemoUser>({
    name: "app-auth",
    storage: "session",
});

function LoginDemo() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const setSession = useAuthStore((s) => s.setSession);
    const logout = useAuthStore((s) => s.logout);

    return (
        <>
            {isAuthenticated ? (
                <Button onClick={logout}>Sair</Button>
            ) : (
                <Button onClick={() => setSession({ user, token })}>Entrar</Button>
            )}
            <AuthGuard isAuthenticated={isAuthenticated} fallback={<Alert>Faça login.</Alert>}>
                <Card>Conteúdo protegido.</Card>
            </AuthGuard>
        </>
    );
}`}
                props={[
                    {
                        name: "name",
                        type: "string",
                        default: '"tempest-auth"',
                        description: "Chave de persistência no storage.",
                    },
                    {
                        name: "storage",
                        type: '"local" | "session"',
                        default: '"local"',
                        description: "Onde persistir a sessão (user + token).",
                    },
                    {
                        name: "initialUser",
                        type: "TUser | null",
                        default: "null",
                        description: "Usuário inicial (útil para hydration SSR).",
                    },
                    {
                        name: "initialToken",
                        type: "string | null",
                        default: "null",
                        description: "Token inicial; isAuthenticated deriva de !!token.",
                    },
                ]}
            >
                <StoreLoginDemo />
            </Example>

            <Example
                id="ex-jwt-decode"
                title="decodeJWT + isJWTExpired — inspeção de token"
                note="decodeJWT LANÇA em token inválido; isJWTExpired nunca lança (inválido = expirado)."
                code={`const { payload } = decodeJWT(token); // throws se malformado
const expired = isJWTExpired(token, 30); // 30s de leeway

// uso defensivo:
try {
    const { payload } = decodeJWT(token);
    console.log(payload.sub, payload.exp);
} catch {
    // token sem 3 segmentos, ou header/payload não-JSON
}`}
            >
                <JWTInspectorDemo />
            </Example>

            <Example
                id="ex-rbac-can"
                title="createRoleAccessControl + Can + useCan — RBAC por papel"
                note="Troque o papel: <Can> esconde a ação; useCan mantém visível mas desabilita com motivo."
                code={`const control = createRoleAccessControl({
    role, // "admin" | "editor" | "viewer"
    roles: {
        admin: ["*"],
        editor: ["posts:create", "posts:update", "comments:read"],
        viewer: ["posts:read", "comments:read"],
    },
});

<AccessControlProvider control={control}>
    {/* useCan → desabilita + tooltip com reason */}
    <GatedAction label="Editar post" action="update" resource="posts" />
    {/* <Can> → esconde quando negado */}
    <Can action="delete" resource="users" fallback={<Badge>oculto</Badge>}>
        <Button variant="danger">Excluir usuário</Button>
    </Can>
</AccessControlProvider>

// dentro de GatedAction:
const { allowed, reason } = useCan({ action, resource });`}
                props={[
                    {
                        name: "permissions",
                        type: "string[]",
                        default: "[]",
                        description: "Permissões concedidas diretamente, independente de papel.",
                    },
                    {
                        name: "roles",
                        type: "Record<string, string[]>",
                        default: "{}",
                        description: "Mapa papel → permissões que aquele papel concede.",
                    },
                    {
                        name: "role",
                        type: "string | string[]",
                        default: "—",
                        description: "Papel(éis) ativo(s); suas permissões são mescladas.",
                    },
                ]}
            >
                <RoleAccessDemo />
            </Example>

            <Example
                id="ex-perms-from-token"
                title="permissionsFromToken — permissões a partir do JWT"
                note='Lê a claim "permissions" (fallback "scopes"/"scope"); não valida assinatura.'
                code={`// token com { permissions: ["posts:create", "posts:update"] }
const permissions = permissionsFromToken(token);

// claim custom:
const perms = permissionsFromToken(token, { claim: "perms" });

// plugue direto no RBAC:
const control = createRoleAccessControl({ permissions });`}
            >
                <PermissionsFromTokenDemo />
            </Example>
        </section>
    );
}
