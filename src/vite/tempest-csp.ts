import { createHash } from "node:crypto";
import type { IndexHtmlTransformContext, Plugin, ResolvedConfig } from "vite";

import type { TempestVitePlugin } from "./tempest-pwa-manifest";

/** Options for {@link tempestCsp}. */
export interface TempestCspOptions {
    /**
     * Endpoints the app calls at runtime, as full URLs. Only the origin
     * (`scheme://host[:port]`) enters `connect-src`: a source expression with a path
     * matches that path alone, so `https://idp/realms/x` would still block
     * `https://idp/realms/x/protocol/openid-connect/token`.
     *
     * Empty entries (`undefined`, `null`, `false`, `""`) are skipped with a build
     * warning instead of leaving a hole in the directive, so passing an env var
     * that is not set is safe. A root-relative path (`/api`) is same-origin and
     * already covered by `'self'`. Anything else that is not an absolute
     * `http(s)`/`ws(s)` URL throws at config time — failing the build, not
     * production. A wildcard host (`https://*.example.com`) is kept as written.
     */
    connect?: ReadonlyArray<string | null | undefined | false>;
    /**
     * Read origins from the same environment the runtime reads. `true` (the
     * default) adds every variable Vite exposes to `import.meta.env` (the
     * `envPrefix` ones, `VITE_` by default) whose value is an absolute
     * `http(s)`/`ws(s)` URL. This is the structural bridge: an origin added to
     * `.env` for a new runtime call lands in the policy with no second list to
     * keep in sync. Pass a list of names to include exactly those — a name that
     * resolves to nothing is reported as a build warning — or `false` to rely on
     * {@link TempestCspOptions.connect} alone.
     */
    env?: boolean | readonly string[];
    /**
     * Also allow the WebSocket twin of every `http(s)` origin (`https://api` →
     * `wss://api`). Measured in Chromium (23/09/2026): `connect-src https://api`
     * blocks `new WebSocket("wss://api")`, while `'self'` does cover a same-origin
     * `ws:` — so an app that derives its socket URL from the API URL breaks
     * without this. Default `true`.
     */
    sockets?: boolean;
    /**
     * Add `'wasm-unsafe-eval'` to `script-src`, which `onnxruntime-web` (the
     * `/vision` and `/tabular` subpaths) needs to compile its WebAssembly. Without
     * it `WebAssembly.compile` throws a `CompileError` naming `script-src`.
     * It grants WebAssembly compilation only, not `eval`. Default `true`.
     */
    wasm?: boolean;
    /**
     * Add `'unsafe-inline'` to `style-src`. React's `style` prop does **not** need
     * it — it writes through the CSSOM, which CSP does not govern (measured in
     * Chromium, 23/09/2026). What needs it is a `<style>` element or a `style=""`
     * attribute, and the SDK's own `applyTheme` injects a `<style>`. Pass `false`
     * when the app never calls `applyTheme`; inline `<style>` blocks in
     * `index.html` are then hashed instead. Always on under `vite dev`, whose CSS
     * injection is a `<style>` element. Default `true`.
     */
    inlineStyles?: boolean;
    /**
     * Extra sources per directive, merged into the defaults (`{ "img-src":
     * ["https://tiles.example.com"] }`), or `false` to drop a directive.
     * `frame-ancestors`, `report-uri` and `sandbox` are ignored by browsers when
     * delivered by `<meta>`, so they reach {@link TempestCspPolicy.header} only.
     */
    directives?: Readonly<Record<string, readonly string[] | false>>;
    /**
     * Apply the policy under `vite dev` too. Default `true`: the failure this
     * plugin exists for is "works in dev, blocked in production", and a policy
     * enforced in dev moves every missing origin to the first page load on the
     * developer's machine. Dev differs from build only in `style-src
     * 'unsafe-inline'` and in allowing every SDK-known origin (see
     * {@link TempestCspPolicy.connect}), because the dev server cannot know which
     * modules the page will load.
     */
    dev?: boolean;
    /** Print the resolved `connect-src` and where each origin came from. Default `true`. */
    log?: boolean;
    /**
     * Receive the resolved policy — for asserting it in a test, or for writing the
     * same policy as an HTTP header (the only channel for `frame-ancestors`).
     */
    onPolicy?: (policy: TempestCspPolicy) => void;
}

/** One origin in `connect-src` and the input that put it there. */
export interface TempestCspSource {
    /** The source expression, e.g. `https://api.example.com`. */
    origin: string;
    /** Where it came from: `env VITE_API_URL`, `connect[0]`, `sockets`, `base` or an SDK module. */
    from: string;
}

/** The policy {@link tempestCsp} resolved for one `index.html`. */
export interface TempestCspPolicy {
    /** Every directive and its sources, including the header-only ones. */
    directives: Record<string, string[]>;
    /** The policy as written into the `<meta http-equiv>` tag. */
    meta: string;
    /** The full policy for a `Content-Security-Policy` response header. */
    header: string;
    /** Every origin added to `connect-src`, with its provenance. */
    connect: TempestCspSource[];
    /** `"serve"` under `vite dev`, `"build"` under `vite build`. */
    command: "serve" | "build";
}

/**
 * Directives a browser ignores when the policy arrives by `<meta>` (CSP3 §3.3),
 * printing a console warning for each.
 */
const HEADER_ONLY_DIRECTIVES: ReadonlySet<string> = new Set([
    "frame-ancestors",
    "report-uri",
    "sandbox",
]);

/**
 * Origins the SDK itself calls, keyed by the module that calls them. In a build
 * the origin enters only when the module is in the bundle; in dev always.
 */
const SDK_ORIGINS: ReadonlyArray<{ module: RegExp; origin: string; from: string }> = [
    {
        module: /[\\/]forms[\\/]use-viacep\.(?:[cm]?js|tsx?)$/,
        origin: "https://viacep.com.br",
        from: "tempest-react-sdk useViaCEP",
    },
];

const ABSOLUTE_URL = /^(?:https?|wss?):\/\//i;
const WILDCARD_SOURCE = /^((?:https?|wss?):\/\/\*\.[a-z0-9.-]+(?::\d+)?)(?:[/?#].*)?$/i;

/**
 * Reduce a URL to the origin a CSP source expression should carry.
 *
 * @param value - The URL as the app configured it.
 * @param from - Its provenance, quoted in the error.
 * @returns The origin, or `undefined` for a root-relative path (covered by `'self'`).
 * @throws {Error} When the value is neither an absolute `http(s)`/`ws(s)` URL nor a path.
 */
export function cspOrigin(value: string, from: string): string | undefined {
    const trimmed = value.trim();
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return undefined;
    const wildcard = WILDCARD_SOURCE.exec(trimmed);
    if (wildcard) return wildcard[1]!.toLowerCase();
    if (ABSOLUTE_URL.test(trimmed)) {
        try {
            const url = new URL(trimmed);
            return `${url.protocol}//${url.host}`;
        } catch {
            throw new Error(`tempestCsp: ${from} is not a valid URL: "${value}"`);
        }
    }
    throw new Error(
        `tempestCsp: ${from} must be an absolute http(s)/ws(s) URL or a root-relative path, got "${value}"`,
    );
}

/**
 * Parse a serialized policy into directives, lowercasing names. A repeated
 * directive keeps its first occurrence, as browsers do.
 *
 * @param policy - A `Content-Security-Policy` value.
 * @returns Directive name → sources.
 */
export function parseCsp(policy: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const part of policy.split(";")) {
        const [name, ...sources] = part.trim().split(/\s+/);
        if (!name) continue;
        const key = name.toLowerCase();
        if (!(key in out)) out[key] = sources;
    }
    return out;
}

/**
 * Serialize directives into a policy string, dropping header-only directives
 * when the target is a `<meta>` tag.
 *
 * @param directives - Directive name → sources.
 * @param target - `"meta"` or `"header"`.
 * @returns The policy value.
 */
export function serializeCsp(
    directives: Readonly<Record<string, readonly string[]>>,
    target: "meta" | "header",
): string {
    return Object.entries(directives)
        .filter(([name]) => target === "header" || !HEADER_ONLY_DIRECTIVES.has(name))
        .map(([name, sources]) => [name, ...sources].join(" "))
        .join("; ");
}

function union(base: readonly string[], extra: readonly string[]): string[] {
    const out = base.filter((source) => source !== "'none'" || extra.length === 0);
    for (const source of extra) if (!out.includes(source)) out.push(source);
    return out.length === 0 ? ["'none'"] : out;
}

function sha256(content: string): string {
    return `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;
}

function decodeEntities(value: string): string {
    return value
        .replace(/&#39;|&#x27;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&amp;/gi, "&");
}

function readAttributes(tag: string): Record<string, string> {
    const out: Record<string, string> = {};
    const pattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    for (const match of tag.matchAll(pattern)) {
        out[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return out;
}

/**
 * Find the policy `index.html` already declares and remove its tag, so the merged
 * policy replaces it instead of stacking a second one (two policies are
 * intersected by the browser, so the stricter would win silently).
 *
 * @throws {Error} When the page declares more than one CSP `<meta>`: merging an
 *   intersection into a union would weaken it, so the plugin refuses.
 */
function extractMetaPolicy(html: string): { html: string; declared?: Record<string, string[]> } {
    const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(
        (match) =>
            readAttributes(match[0])["http-equiv"]?.toLowerCase() === "content-security-policy",
    );
    if (tags.length === 0) return { html };
    if (tags.length > 1) {
        throw new Error(
            "tempestCsp: index.html declares more than one Content-Security-Policy <meta>; merge them into one",
        );
    }
    const tag = tags[0]!;
    return {
        html:
            html.slice(0, tag.index) +
            html.slice(tag.index! + tag[0].length).replace(/^[ \t]*\r?\n/, ""),
        declared: parseCsp(readAttributes(tag[0]).content ?? ""),
    };
}

function inlineHashes(html: string, element: "script" | "style"): string[] {
    const pattern = new RegExp(`<${element}\\b([^>]*)>([\\s\\S]*?)</${element}>`, "gi");
    const hashes: string[] = [];
    for (const match of html.matchAll(pattern)) {
        const attributes = readAttributes(`<x ${match[1]}>`);
        if (element === "script" && "src" in attributes) continue;
        if (match[2]!.length === 0) continue;
        const hash = sha256(match[2]!);
        if (!hashes.includes(hash)) hashes.push(hash);
    }
    return hashes;
}

/**
 * Write the policy tag where it governs the whole page. A `<meta>` CSP applies
 * only to what follows it, so it goes right after `<meta charset>` — unless a
 * resource precedes the charset, as the React Refresh preamble does under
 * `vite dev` (`head-prepend`), in which case it goes right after `<head>`.
 */
function insertMeta(html: string, policy: string): string {
    const escaped = policy.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const tag = `<meta http-equiv="Content-Security-Policy" content="${escaped}" />`;
    const charset = /<meta\b[^>]*\bcharset\s*=[^>]*>/i.exec(html);
    const head = /<head\b[^>]*>/i.exec(html);
    const resourceFirst =
        charset !== null &&
        head !== null &&
        /<(?:script|link|style)\b/i.test(html.slice(head.index, charset.index));
    const anchor = charset && head && charset.index > head.index && !resourceFirst ? charset : head;
    if (!anchor) return `${tag}\n${html}`;
    const at = anchor.index + anchor[0].length;
    return `${html.slice(0, at)}\n    ${tag}${html.slice(at)}`;
}

function bundleModuleIds(ctx: IndexHtmlTransformContext): string[] {
    const ids: string[] = [];
    for (const output of Object.values(ctx.bundle ?? {})) {
        if (output.type !== "chunk") continue;
        ids.push(...(output.moduleIds ?? Object.keys(output.modules ?? {})));
    }
    return ids;
}

/**
 * Vite plugin that writes a Content-Security-Policy `<meta>` into `index.html`
 * and derives `connect-src` from the origins the app actually calls.
 *
 * It exists because of how a missing origin fails: the request is blocked
 * before a connection opens, so there is no entry in the Network tab, nothing in
 * the server log, `curl` succeeds, and the app sees `TypeError: Failed to
 * fetch` — indistinguishable from offline, DNS or CORS. And a hand-written CSP
 * plugin is usually `apply: "build"`, so it only fails in production. This
 * plugin closes both ends:
 *
 * - origins come from the same `import.meta.env` the runtime reads
 *   ({@link TempestCspOptions.env}), reduced to `scheme://host[:port]`, with
 *   empty values skipped — no second list to drift;
 * - the policy is enforced under `vite dev` as well ({@link TempestCspOptions.dev});
 * - the build prints every origin and its provenance.
 *
 * Defaults cover what the SDK's stack needs and nothing more: `'self'`
 * everywhere, `'wasm-unsafe-eval'` for ONNX Runtime, `blob:` for workers, object
 * URLs and media, `data:` for images and fonts, `object-src 'none'`,
 * `base-uri 'self'`, `form-action 'self'`. Inline `<script>` blocks left in
 * `index.html` (a `themeInitScript()` anti-flash script, say) are allowed by
 * SHA-256 hash, never by `'unsafe-inline'`.
 *
 * An existing CSP `<meta>` in `index.html` is merged, not overwritten: every
 * directive it declares is kept verbatim — the plugin never loosens a choice the
 * app wrote — except `connect-src`, which gains the resolved origins, since
 * that is the list the plugin exists to maintain. Directives it does not declare
 * come from the defaults.
 *
 * @param options - See {@link TempestCspOptions}.
 * @returns A Vite plugin, to be placed in `plugins`. It runs as a `post` HTML
 *   transform, so a plugin that rewrites inline scripts after it would
 *   invalidate the hashes.
 *
 * @example
 * // vite.config.ts
 * import { createViteConfig, tempestCsp } from "tempest-react-sdk/vite";
 *
 * export default createViteConfig({
 *     plugins: [tempestCsp({ connect: ["https://sso.example.com/realms/app"] })],
 * });
 */
export function tempestCsp(options: TempestCspOptions = {}): TempestVitePlugin {
    const {
        connect = [],
        env = true,
        sockets = true,
        wasm = true,
        inlineStyles = true,
        directives: extra = {},
        dev = true,
        log = true,
        onPolicy,
    } = options;

    let config: ResolvedConfig | undefined;
    let resolved: TempestCspSource[] = [];
    let lastLogged = "";

    function add(list: TempestCspSource[], origin: string | undefined, from: string): void {
        if (origin === undefined || list.some((source) => source.origin === origin)) return;
        list.push({ origin, from });
    }

    function resolveSources(resolvedConfig: ResolvedConfig): TempestCspSource[] {
        const list: TempestCspSource[] = [];
        const values: Record<string, unknown> = resolvedConfig.env ?? {};
        const prefixes = [resolvedConfig.envPrefix ?? "VITE_"].flat();
        if (env === true) {
            for (const [name, value] of Object.entries(values)) {
                if (!prefixes.some((prefix) => name.startsWith(prefix))) continue;
                if (typeof value !== "string" || !ABSOLUTE_URL.test(value.trim())) continue;
                add(list, cspOrigin(value, `env ${name}`), `env ${name}`);
            }
        } else if (Array.isArray(env)) {
            for (const name of env) {
                const value = values[name];
                if (typeof value !== "string" || value.trim() === "") {
                    resolvedConfig.logger.warn(
                        `tempestCsp: env ${name} is empty — nothing added to connect-src`,
                    );
                    continue;
                }
                add(list, cspOrigin(value, `env ${name}`), `env ${name}`);
            }
        }
        connect.forEach((value, index) => {
            if (!value || value.trim() === "") {
                resolvedConfig.logger.warn(
                    `tempestCsp: connect[${index}] is empty — skipped, nothing added to connect-src`,
                );
                return;
            }
            add(list, cspOrigin(value, `connect[${index}]`), `connect[${index}]`);
        });
        return list;
    }

    function withSockets(list: readonly TempestCspSource[]): TempestCspSource[] {
        const out = [...list];
        if (!sockets) return out;
        for (const { origin } of list) {
            const twin = origin.replace(/^http(s?):/i, "ws$1:");
            if (twin !== origin) add(out, twin, `sockets (${origin})`);
        }
        return out;
    }

    function defaults(baseOrigin: string | undefined, serve: boolean): Record<string, string[]> {
        const self = baseOrigin ? ["'self'", baseOrigin] : ["'self'"];
        const policy: Record<string, string[]> = {
            "default-src": [...self],
            "script-src": wasm ? [...self, "'wasm-unsafe-eval'"] : [...self],
            "style-src": inlineStyles || serve ? [...self, "'unsafe-inline'"] : [...self],
            "img-src": [...self, "data:", "blob:"],
            "font-src": [...self, "data:"],
            "media-src": [...self, "blob:"],
            "connect-src": ["'self'", "blob:", "data:"],
            "worker-src": [...self, "blob:"],
            "manifest-src": [...self],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
        };
        for (const [name, sources] of Object.entries(extra)) {
            const key = name.toLowerCase();
            if (sources === false) delete policy[key];
            else policy[key] = union(policy[key] ?? [], sources);
        }
        return policy;
    }

    const plugin: Plugin = {
        name: "tempest-csp",
        configResolved(resolvedConfig) {
            config = resolvedConfig;
            resolved = resolveSources(resolvedConfig);
        },
        transformIndexHtml: {
            order: "post",
            handler(source, ctx) {
                const serve = config?.command === "serve";
                if (serve && !dev) return source;

                const connectSources = withSockets(resolved);
                const base = config?.base ?? "/";
                const baseOrigin = ABSOLUTE_URL.test(base) ? cspOrigin(base, "base") : undefined;
                if (baseOrigin) add(connectSources, baseOrigin, "base");
                const moduleIds = serve ? [] : bundleModuleIds(ctx);
                for (const known of SDK_ORIGINS) {
                    if (serve || moduleIds.some((id) => known.module.test(id))) {
                        add(connectSources, known.origin, known.from);
                    }
                }
                const allSources = connectSources;

                const { html, declared = {} } = extractMetaPolicy(source);
                const policy = defaults(baseOrigin, serve);
                if (!("script-src" in declared)) {
                    policy["script-src"] = union(
                        policy["script-src"] ?? [],
                        inlineHashes(html, "script"),
                    );
                }
                if (
                    !("style-src" in declared) &&
                    !policy["style-src"]?.includes("'unsafe-inline'")
                ) {
                    policy["style-src"] = union(
                        policy["style-src"] ?? [],
                        inlineHashes(html, "style"),
                    );
                }
                const merged: Record<string, string[]> = { ...policy };
                for (const [name, sources] of Object.entries(declared)) merged[name] = sources;
                merged["connect-src"] = union(
                    merged["connect-src"] ?? ["'self'"],
                    allSources.map((entry) => entry.origin),
                );

                const result: TempestCspPolicy = {
                    directives: merged,
                    meta: serializeCsp(merged, "meta"),
                    header: serializeCsp(merged, "header"),
                    connect: allSources,
                    command: serve ? "serve" : "build",
                };

                if (log && config && result.header !== lastLogged) {
                    lastLogged = result.header;
                    const lines = allSources.map((entry) => `  ${entry.origin}  ← ${entry.from}`);
                    config.logger.info(
                        [
                            `tempest-csp: connect-src ${merged["connect-src"].join(" ")}`,
                            ...(lines.length > 0
                                ? lines
                                : ["  (no cross-origin endpoint: only 'self')"]),
                        ].join("\n"),
                    );
                }
                onPolicy?.(result);
                return insertMeta(html, result.meta);
            },
        },
    };

    return plugin as TempestVitePlugin;
}
