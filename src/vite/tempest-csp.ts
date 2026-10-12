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

/**
 * Where each fetch directive falls back when a policy does not declare it, in
 * order. Ported from CSP3 §6.8.3, "Get fetch directive fallback list"
 * (https://w3c.github.io/webappsec-csp/#directive-fallback-list, checked
 * 11/10/2026), which lists twelve effective directives: `script-src-elem`,
 * `script-src-attr`, `style-src-elem`, `style-src-attr`, `worker-src`,
 * `connect-src`, `manifest-src`, `object-src`, `frame-src`, `media-src`,
 * `font-src` and `img-src`. Four more are listed here on purpose:
 *
 * - `script-src`, `style-src` and `child-src` are never an effective directive,
 *   but every chain that reaches them continues to `default-src`;
 * - `fenced-frame-src` comes from the Fenced Frame spec, which extends the
 *   `frame-src` chain;
 * - `prefetch-src` was in earlier CSP3 drafts (→ `default-src`) and is gone from
 *   the current one; a browser that still resolves it does so through
 *   `default-src`, so it is treated as inherited.
 *
 * A directive absent from this map does not fall back at all (`base-uri`,
 * `form-action`, `frame-ancestors`, …): leaving it out of a policy allows
 * everything, so adding it only ever restricts.
 */
const CSP_FALLBACK: Readonly<Record<string, readonly string[]>> = {
    "script-src-elem": ["script-src", "default-src"],
    "script-src-attr": ["script-src", "default-src"],
    "style-src-elem": ["style-src", "default-src"],
    "style-src-attr": ["style-src", "default-src"],
    "worker-src": ["child-src", "script-src", "default-src"],
    "frame-src": ["child-src", "default-src"],
    "fenced-frame-src": ["frame-src", "child-src", "default-src"],
    "child-src": ["default-src"],
    "connect-src": ["default-src"],
    "font-src": ["default-src"],
    "img-src": ["default-src"],
    "manifest-src": ["default-src"],
    "media-src": ["default-src"],
    "object-src": ["default-src"],
    "prefetch-src": ["default-src"],
    "script-src": ["default-src"],
    "style-src": ["default-src"],
};

/**
 * The sources a declared policy already applies to a directive it does not
 * name, by walking {@link CSP_FALLBACK}.
 *
 * @param declared - The policy the app declared.
 * @param name - A directive the app did not declare.
 * @returns The inherited sources, or `undefined` when nothing governs the directive.
 */
function inheritedSources(
    declared: Readonly<Record<string, string[]>>,
    name: string,
): string[] | undefined {
    for (const parent of CSP_FALLBACK[name] ?? []) {
        if (parent in declared) return declared[parent];
    }
    return undefined;
}

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
 * An existing CSP `<meta>` in `index.html` is merged, not overwritten, and the
 * merge never loosens what the app wrote:
 *
 * - a directive it declares is kept verbatim, except `connect-src`, which gains
 *   the resolved origins (the list the plugin exists to maintain) unless it is
 *   `'none'` — declared or inherited from `default-src` — in which case the
 *   origins stay out and each one is reported as a build warning. Sources in
 *   {@link TempestCspOptions.directives} for a declared directive are not added
 *   (a build warning names them); `false` there removes it;
 * - a fetch directive it does not declare but already governs through the CSP3
 *   fallback chain (§6.8.3 — `img-src` → `default-src`,
 *   `worker-src` → `child-src` → `script-src` → `default-src`) is left out, so it
 *   keeps falling back. Filling it from the defaults would replace a
 *   `default-src 'none'` with `'self' data: blob:`. No inline-script hash and no
 *   `'wasm-unsafe-eval'` is added to it, and an inline `<script>` is judged by a
 *   declared `script-src-elem` before `script-src`; `connect-src` starts from the inherited
 *   value, and so does any directive passed in {@link TempestCspOptions.directives};
 * - a default that is exactly `'none'` (`object-src`), or a directive that does
 *   not fall back (`base-uri`, `form-action`), is still added: it can only
 *   restrict;
 * - a directive nothing in the declared policy governs comes from the defaults.
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

    const configured: Record<string, readonly string[] | false> = Object.fromEntries(
        Object.entries(extra).map(([name, sources]) => [name.toLowerCase(), sources]),
    );
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
        for (const [name, sources] of Object.entries(configured)) {
            if (sources === false) delete policy[name];
            else policy[name] = union(policy[name] ?? [], sources);
        }
        return policy;
    }

    /**
     * Merge the defaults, the declared policy and the configured
     * {@link TempestCspOptions.directives}, never loosening what was declared. A
     * declared directive is kept verbatim: configured sources for it are not
     * added — adding would loosen the app's policy — and each ignored source is
     * reported as a build warning, while a configured `false` removes it, since
     * removing is an explicit choice. An inherited directive (see
     * {@link inheritedSources}) is omitted unless the default is `'none'` or the
     * config adds sources, which then extend the inherited value instead of the
     * defaults.
     */
    function mergePolicy(
        policy: Readonly<Record<string, string[]>>,
        declared: Readonly<Record<string, string[]>>,
    ): Record<string, string[]> {
        const merged: Record<string, string[]> = {};
        for (const [name, sources] of Object.entries(policy)) {
            if (name in declared) {
                merged[name] = declared[name]!;
                continue;
            }
            const inherited = inheritedSources(declared, name);
            const added = configured[name];
            if (inherited === undefined) merged[name] = sources;
            else if (Array.isArray(added)) merged[name] = union(inherited, added);
            else if (sources.length === 1 && sources[0] === "'none'") merged[name] = sources;
        }
        for (const [name, sources] of Object.entries(declared)) merged[name] ??= sources;
        for (const [name, sources] of Object.entries(configured)) {
            if (!(name in declared)) continue;
            if (sources === false) {
                delete merged[name];
                continue;
            }
            const ignored = sources.filter((source) => !declared[name]!.includes(source));
            if (ignored.length > 0) {
                config?.logger.warn(
                    `tempestCsp: index.html declares ${name}, so directives["${name}"] is not added to it ` +
                        `(${ignored.join(" ")}); the plugin never loosens a declared policy — add them to the <meta> instead`,
                );
            }
        }
        return merged;
    }

    /**
     * Report every inline `<script>` the final policy blocks. It only happens when
     * the app's declared policy governs `script-src` — directly or through
     * `default-src` — since the plugin then adds no hash, and the symptom would
     * otherwise be a script that silently never runs (under `vite dev`, the React
     * Refresh preamble, which takes the page down with it).
     *
     * `<script>` elements are governed by `script-src-elem` when the policy has
     * one, so that is the directive judged and named.
     *
     * @param html - The page, without its CSP `<meta>`.
     * @param directive - `"script-src-elem"` when declared, else `"script-src"`.
     * @param effective - The sources the browser will apply to inline `<script>`
     *   elements, or `undefined` when no directive governs them.
     */
    function warnBlockedInlineScripts(
        html: string,
        directive: string,
        effective: readonly string[] | undefined,
    ): void {
        if (!effective || !config) return;
        const unsafeInline =
            effective.includes("'unsafe-inline'") &&
            !effective.some((source) => /^'(?:sha\d{3}|nonce)-/.test(source));
        if (unsafeInline) return;
        const blocked = inlineHashes(html, "script").filter((hash) => !effective.includes(hash));
        if (blocked.length === 0) return;
        config.logger.warn(
            `tempestCsp: the Content-Security-Policy declared in index.html blocks ${blocked.length} inline <script> ` +
                `(${directive} ${effective.join(" ")}); the plugin never loosens a declared policy, so add ${blocked.join(" ")} to ${directive}`,
        );
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
                const filled = (name: string): boolean =>
                    !(name in declared) && inheritedSources(declared, name) === undefined;
                if (filled("script-src") && !("script-src-elem" in declared)) {
                    policy["script-src"] = union(
                        policy["script-src"] ?? [],
                        inlineHashes(html, "script"),
                    );
                }
                if (
                    filled("style-src") &&
                    !("style-src-elem" in declared) &&
                    !policy["style-src"]?.includes("'unsafe-inline'")
                ) {
                    policy["style-src"] = union(
                        policy["style-src"] ?? [],
                        inlineHashes(html, "style"),
                    );
                }
                const merged = mergePolicy(policy, declared);
                const origins = allSources.map((entry) => entry.origin);
                const inheritedConnect = inheritedSources(declared, "connect-src");
                const declaredConnect = merged["connect-src"] ?? inheritedConnect;
                const declaredNone =
                    declaredConnect?.length === 1 &&
                    declaredConnect[0] === "'none'" &&
                    ("connect-src" in declared || inheritedConnect !== undefined);
                if (declaredNone) {
                    if (origins.length > 0) {
                        config?.logger.warn(
                            `tempestCsp: index.html declares connect-src 'none'${"connect-src" in declared ? "" : " (through default-src)"}, ` +
                                `so these origins stay out and requests to them will be blocked: ${origins.join(" ")}`,
                        );
                    }
                } else if (
                    "connect-src" in merged ||
                    origins.length > 0 ||
                    inheritedConnect === undefined
                ) {
                    merged["connect-src"] = union(declaredConnect ?? ["'self'"], origins);
                }

                const scriptElem = "script-src-elem" in declared ? "script-src-elem" : "script-src";
                warnBlockedInlineScripts(
                    html,
                    scriptElem,
                    merged[scriptElem] ?? inheritedSources(declared, scriptElem),
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
                            `tempest-csp: connect-src ${(merged["connect-src"] ?? inheritedConnect ?? []).join(" ")}`,
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
