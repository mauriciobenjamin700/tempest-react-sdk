// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { cspOrigin, parseCsp, serializeCsp, tempestCsp } from "./tempest-csp";
import type { TempestCspOptions, TempestCspPolicy } from "./tempest-csp";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>t</title>
  </head>
  <body><script type="module" src="/src/main.tsx"></script></body>
</html>`;

interface Run {
    html: string;
    policy: TempestCspPolicy;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
}

/**
 * Drive the plugin's hooks the way Vite does: `configResolved`, then the `post`
 * HTML transform, and return the page plus the policy it reported.
 */
function run(
    options: TempestCspOptions = {},
    {
        html = PAGE,
        env = {},
        command = "build",
        base = "/",
        envPrefix,
        bundle,
    }: {
        html?: string;
        env?: Record<string, unknown>;
        command?: "build" | "serve";
        base?: string;
        envPrefix?: string | string[];
        bundle?: Record<string, unknown>;
    } = {},
): Run {
    let policy: TempestCspPolicy | undefined;
    const plugin = tempestCsp({ ...options, onPolicy: (p) => (policy = p) }) as any;
    const info = vi.fn();
    const warn = vi.fn();
    plugin.configResolved({ command, base, env, envPrefix, logger: { info, warn } });
    const out = plugin.transformIndexHtml.handler(html, { path: "/index.html", bundle });
    return { html: out, policy: policy!, info, warn };
}

describe("tempestCsp — connect-src is derived from the origins the app calls", () => {
    it("reads every URL-valued VITE_ variable, reduced to its origin", () => {
        const { policy } = run(
            {},
            {
                env: {
                    VITE_API_URL: "https://api.example.com/v1",
                    VITE_OIDC_ISSUER: "https://sso.example.com/realms/app",
                    VITE_VAPID_PUBLIC_KEY: "BOr1…",
                    BASE_URL: "/",
                    MODE: "production",
                },
            },
        );
        expect(policy.directives["connect-src"]).toEqual([
            "'self'",
            "blob:",
            "data:",
            "https://api.example.com",
            "https://sso.example.com",
            "wss://api.example.com",
            "wss://sso.example.com",
        ]);
        expect(policy.connect.map((entry) => entry.from)).toContain("env VITE_OIDC_ISSUER");
    });

    it("never emits the path: a path-scoped source would still block the token endpoint", () => {
        expect(cspOrigin("https://sso.example.com/realms/app?x=1#y", "t")).toBe(
            "https://sso.example.com",
        );
        expect(cspOrigin("http://127.0.0.1:8000/api", "t")).toBe("http://127.0.0.1:8000");
        expect(cspOrigin("https://api.example.com:443/", "t")).toBe("https://api.example.com");
    });

    it("keeps a wildcard host as written, minus the path", () => {
        expect(cspOrigin("https://*.example.com/a", "t")).toBe("https://*.example.com");
    });

    it("treats a root-relative path as same-origin, which 'self' already covers", () => {
        expect(cspOrigin("/api", "t")).toBeUndefined();
        const { policy, warn } = run({ connect: ["/api"] }, { env: {} });
        expect(policy.connect).toEqual([]);
        expect(warn).not.toHaveBeenCalled();
    });

    it("fails the build on a value that is not a URL, instead of shipping a broken policy", () => {
        expect(() => cspOrigin("api.example.com", "connect[0]")).toThrow(/connect\[0\]/);
        expect(() => cspOrigin("//cdn.example.com", "connect[0]")).toThrow(/absolute/);
        expect(() => cspOrigin("https://exa mple.com", "env X")).toThrow(/not a valid URL/);
        expect(() => run({ connect: ["api.example.com"] })).toThrow(/absolute/);
    });

    it("skips an empty entry with a warning instead of leaving a hole in the directive", () => {
        const { policy, warn } = run({ connect: [undefined, "", null, false, "https://a.test"] });
        expect(policy.meta).not.toMatch(/ {2}|; ;/);
        expect(policy.connect.map((entry) => entry.origin)).toEqual([
            "https://a.test",
            "wss://a.test",
        ]);
        expect(warn).toHaveBeenCalledTimes(4);
        expect(warn.mock.calls[0]![0]).toMatch(/connect\[0\] is empty/);
    });

    it("with an explicit env list, includes only those names and reports the empty ones", () => {
        const { policy, warn } = run(
            { env: ["VITE_API_URL", "VITE_OIDC_ISSUER"] },
            { env: { VITE_API_URL: "https://api.test/x", VITE_OTHER_URL: "https://other.test" } },
        );
        expect(policy.connect.map((entry) => entry.origin)).toEqual([
            "https://api.test",
            "wss://api.test",
        ]);
        expect(warn.mock.calls[0]![0]).toMatch(/VITE_OIDC_ISSUER is empty/);
    });

    it("with env: false, relies on connect alone", () => {
        const { policy } = run(
            { env: false, connect: ["wss://ws.test/socket"] },
            { env: { VITE_API_URL: "https://api.test" } },
        );
        expect(policy.connect).toEqual([{ origin: "wss://ws.test", from: "connect[0]" }]);
    });

    it("honours a custom envPrefix, as import.meta.env does", () => {
        const { policy } = run(
            {},
            { envPrefix: ["APP_"], env: { APP_API: "https://api.test", VITE_X: "https://x.test" } },
        );
        expect(policy.connect.map((entry) => entry.origin)).toEqual([
            "https://api.test",
            "wss://api.test",
        ]);
    });

    it("adds no WebSocket twin when sockets is off, and none for a ws origin", () => {
        const { policy } = run({ sockets: false, env: false, connect: ["https://a.test"] });
        expect(policy.connect.map((entry) => entry.origin)).toEqual(["https://a.test"]);
        const ws = run({ env: false, connect: ["wss://w.test"] });
        expect(ws.policy.connect.map((entry) => entry.origin)).toEqual(["wss://w.test"]);
    });

    it("deduplicates an origin reached from two inputs, keeping the first provenance", () => {
        const { policy } = run(
            { connect: ["https://api.test/other"] },
            { env: { VITE_API_URL: "https://api.test" } },
        );
        expect(policy.connect.filter((entry) => entry.origin === "https://api.test")).toEqual([
            { origin: "https://api.test", from: "env VITE_API_URL" },
        ]);
    });
});

describe("tempestCsp — origins the SDK itself calls", () => {
    it("allows ViaCEP in a build only when useViaCEP is in the bundle", () => {
        const withHook = run(
            {},
            {
                bundle: {
                    "assets/a.js": {
                        type: "chunk",
                        moduleIds: ["/app/node_modules/tempest-react-sdk/dist/forms/use-viacep.js"],
                    },
                    "assets/a.css": { type: "asset" },
                },
            },
        );
        expect(withHook.policy.directives["connect-src"]).toContain("https://viacep.com.br");
        expect(withHook.policy.directives["connect-src"]).not.toContain("wss://viacep.com.br");

        const legacy = run(
            {},
            {
                bundle: {
                    "a.js": { type: "chunk", modules: { "/x/dist/forms/use-viacep.cjs": {} } },
                },
            },
        );
        expect(legacy.policy.directives["connect-src"]).toContain("https://viacep.com.br");

        const without = run(
            {},
            { bundle: { "a.js": { type: "chunk", moduleIds: ["/src/main.tsx"] } } },
        );
        expect(without.policy.directives["connect-src"]).not.toContain("https://viacep.com.br");
    });

    it("allows every SDK-known origin under dev, which cannot know the module graph yet", () => {
        const { policy } = run({}, { command: "serve" });
        expect(policy.directives["connect-src"]).toContain("https://viacep.com.br");
        expect(policy.command).toBe("serve");
    });
});

describe("tempestCsp — defaults cover the SDK stack", () => {
    it("ships the directives WASM, workers, object URLs and applyTheme need", () => {
        const { policy } = run();
        expect(policy.directives).toMatchObject({
            "default-src": ["'self'"],
            "script-src": ["'self'", "'wasm-unsafe-eval'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "blob:"],
            "worker-src": ["'self'", "blob:"],
            "media-src": ["'self'", "blob:"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
        });
    });

    it("drops the WASM and inline-style allowances when the app opts out", () => {
        const { policy } = run({ wasm: false, inlineStyles: false });
        expect(policy.directives["script-src"]).toEqual(["'self'"]);
        expect(policy.directives["style-src"]).toEqual(["'self'"]);
    });

    it("keeps inline styles allowed under dev even when opted out, since Vite injects <style>", () => {
        const { policy } = run({ inlineStyles: false }, { command: "serve" });
        expect(policy.directives["style-src"]).toContain("'unsafe-inline'");
    });

    it("merges extra sources per directive and removes a directive set to false", () => {
        const { policy } = run({
            directives: {
                "IMG-SRC": ["https://tiles.test", "data:"],
                "frame-src": ["https://www.youtube.com"],
                "manifest-src": false,
            },
        });
        expect(policy.directives["img-src"]).toEqual([
            "'self'",
            "data:",
            "blob:",
            "https://tiles.test",
        ]);
        expect(policy.directives["frame-src"]).toEqual(["https://www.youtube.com"]);
        expect(policy.directives).not.toHaveProperty("manifest-src");
    });

    it("adds an absolute base's origin to the asset directives", () => {
        const { policy } = run({}, { base: "https://cdn.test/app/" });
        expect(policy.directives["script-src"]).toContain("https://cdn.test");
        expect(policy.directives["connect-src"]).toContain("https://cdn.test");
    });
});

describe("tempestCsp — the <meta> it writes", () => {
    it("lands right after <meta charset>, before any script, so it governs the whole page", () => {
        const { html, policy } = run();
        const meta = html.indexOf('http-equiv="Content-Security-Policy"');
        expect(meta).toBeGreaterThan(html.indexOf("charset"));
        expect(meta).toBeLessThan(html.indexOf("<script"));
        expect(html).toContain(`content="${policy.meta}"`);
    });

    it("lands after <head> when there is no charset, and at the top when there is no head", () => {
        const noCharset = run({}, { html: "<html><head><title>t</title></head></html>" }).html;
        expect(noCharset).toMatch(/<head>\n {4}<meta http-equiv="Content-Security-Policy"/);
        const bare = run({}, { html: "<p>x</p>" }).html;
        expect(bare.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    });

    it("lands before a script that precedes the charset, as the dev React Refresh preamble does", () => {
        const html = PAGE.replace(
            "<head>",
            '<head>\n<script type="module">window.$RefreshReg$ = () => {};</script>',
        );
        const out = run({}, { html, command: "serve" }).html;
        expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<script"));
    });

    it("keeps header-only directives out of the <meta>, where browsers ignore them", () => {
        const { policy } = run({
            directives: { "frame-ancestors": ["'none'"], "report-uri": ["/csp"] },
        });
        expect(policy.meta).not.toContain("frame-ancestors");
        expect(policy.meta).not.toContain("report-uri");
        expect(policy.header).toContain("frame-ancestors 'none'");
        expect(policy.header).toContain("report-uri /csp");
    });

    it("escapes the attribute value", () => {
        const { html } = run({ directives: { "script-src": ['"x"&'] } });
        expect(html).toContain("&quot;x&quot;&amp;");
    });

    it("allows an inline <script> by SHA-256 hash, never by 'unsafe-inline'", () => {
        const inline = "document.documentElement.dataset.x = '1';";
        const html = PAGE.replace("</head>", `<script>${inline}</script><script></script></head>`);
        const { policy } = run({}, { html });
        const hash = `'sha256-${createHash("sha256").update(inline).digest("base64")}'`;
        expect(policy.directives["script-src"]).toContain(hash);
        expect(policy.directives["script-src"]).not.toContain("'unsafe-inline'");
        expect(
            policy.directives["script-src"]!.filter((s) => s.startsWith("'sha256-")),
        ).toHaveLength(1);
    });

    it("hashes inline <style> blocks only when inline styles are otherwise forbidden", () => {
        const html = PAGE.replace("</head>", "<style>body{margin:0}</style></head>");
        const hashed = run({ inlineStyles: false }, { html }).policy.directives["style-src"]!;
        expect(hashed.some((s) => s.startsWith("'sha256-"))).toBe(true);
        const open = run({}, { html }).policy.directives["style-src"]!;
        expect(open.some((s) => s.startsWith("'sha256-"))).toBe(false);
    });

    it("does nothing under dev when dev is off", () => {
        const plugin = tempestCsp({ dev: false }) as any;
        plugin.configResolved({
            command: "serve",
            base: "/",
            env: {},
            logger: { info() {}, warn() {} },
        });
        expect(plugin.transformIndexHtml.handler(PAGE, {})).toBe(PAGE);
        expect(plugin.transformIndexHtml.order).toBe("post");
        expect(plugin.name).toBe("tempest-csp");
    });
});

describe("tempestCsp — an existing policy is merged, never loosened", () => {
    const declared = (content: string, quote = '"'): string =>
        PAGE.replace(
            "<title>",
            `<meta http-equiv="content-security-policy" content=${quote}${content}${quote}>\n    <title>`,
        );

    it("keeps every directive the app declared verbatim and only extends connect-src", () => {
        const { html, policy } = run(
            {},
            {
                html: declared(
                    "script-src 'self'; style-src 'self'; connect-src 'self' https://old.test",
                ),
                env: { VITE_API_URL: "https://api.test" },
            },
        );
        expect(policy.directives["script-src"]).toEqual(["'self'"]);
        expect(policy.directives["style-src"]).toEqual(["'self'"]);
        expect(policy.directives["connect-src"]).toEqual([
            "'self'",
            "https://old.test",
            "https://api.test",
            "wss://api.test",
        ]);
        expect(policy.directives["object-src"]).toEqual(["'none'"]);
        expect(html.match(/Content-Security-Policy/gi)).toHaveLength(1);
    });

    it("does not add hashes to a script-src the app declared", () => {
        const html = declared("script-src 'self' 'unsafe-inline'").replace(
            "</head>",
            "<script>1</script></head>",
        );
        expect(run({}, { html }).policy.directives["script-src"]).toEqual([
            "'self'",
            "'unsafe-inline'",
        ]);
    });

    it("replaces 'none' in connect-src once there is an origin to allow", () => {
        const { policy } = run(
            { connect: ["https://a.test"], sockets: false },
            { html: declared("connect-src 'none'") },
        );
        expect(policy.directives["connect-src"]).toEqual(["https://a.test"]);
        const kept = run({ env: false }, { html: declared("connect-src 'none'") });
        expect(kept.policy.directives["connect-src"]).toEqual(["'none'"]);
    });

    it("reads a single-quoted, entity-encoded content attribute", () => {
        const { policy } = run(
            {},
            { html: declared("script-src &#39;self&#39; https://cdn.test", "'") },
        );
        expect(policy.directives["script-src"]).toEqual(["'self'", "https://cdn.test"]);
    });

    it("refuses two CSP <meta> tags, whose intersection a merge would weaken", () => {
        const html = declared("default-src 'self'").replace(
            "<title>",
            `<meta http-equiv="Content-Security-Policy" content="img-src 'self'"><title>`,
        );
        expect(() => run({}, { html })).toThrow(/more than one/);
    });
});

describe("tempestCsp — diagnostics", () => {
    it("prints each connect-src origin with its provenance, once per distinct policy", () => {
        const plugin = tempestCsp() as any;
        const info = vi.fn();
        plugin.configResolved({
            command: "serve",
            base: "/",
            env: { VITE_OIDC_ISSUER: "https://sso.test/realms/app" },
            logger: { info, warn: vi.fn() },
        });
        plugin.transformIndexHtml.handler(PAGE, {});
        plugin.transformIndexHtml.handler(PAGE, {});
        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0]![0]).toContain("https://sso.test  ← env VITE_OIDC_ISSUER");
    });

    it("says so when nothing cross-origin was found, and stays quiet with log: false", () => {
        expect(run({}).info.mock.calls[0]![0]).toContain("only 'self'");
        expect(run({ log: false }).info).not.toHaveBeenCalled();
    });
});

describe("tempestCsp — edge inputs", () => {
    it("reads an unquoted attribute and treats a CSP <meta> without content as empty", () => {
        const html = PAGE.replace(
            "<title>",
            "<meta http-equiv=Content-Security-Policy>\n    <title>",
        );
        const { policy } = run({}, { html });
        expect(policy.directives["default-src"]).toEqual(["'self'"]);
    });

    it("hashes a repeated inline script once", () => {
        const html = PAGE.replace("</head>", "<script>1</script><script>1</script></head>");
        const hashes = run({}, { html }).policy.directives["script-src"]!.filter((s) =>
            s.startsWith("'sha256-"),
        );
        expect(hashes).toHaveLength(1);
    });

    it("writes 'none' for a directive left with no source, and keeps 'self' when connect-src was removed", () => {
        const { policy } = run({
            env: false,
            directives: { "frame-src": [], "connect-src": false },
        });
        expect(policy.directives["frame-src"]).toEqual(["'none'"]);
        expect(policy.directives["connect-src"]).toEqual(["'self'"]);
    });

    it("tolerates a config without env and a chunk without module ids", () => {
        const plugin = tempestCsp() as any;
        plugin.configResolved({ command: "build", logger: { info() {}, warn() {} } });
        const html = plugin.transformIndexHtml.handler(PAGE, {
            bundle: { "a.js": { type: "chunk" } },
        });
        expect(html).toContain("Content-Security-Policy");
    });
});

describe("parseCsp / serializeCsp", () => {
    it("round-trips a policy, lowercasing names and keeping the first repeated directive", () => {
        const parsed = parseCsp(" Default-Src 'self' ; ; img-src data: ; default-src *");
        expect(parsed).toEqual({ "default-src": ["'self'"], "img-src": ["data:"] });
        expect(serializeCsp(parsed, "meta")).toBe("default-src 'self'; img-src data:");
    });
});

describe("tempestCsp — a real vite build, no mocks", () => {
    it("writes the env-derived policy into dist/index.html", async () => {
        const { build } = await import("vite");
        const root = mkdtempSync(join(tmpdir(), "tempest-csp-"));
        try {
            mkdirSync(join(root, "src"));
            writeFileSync(join(root, "index.html"), PAGE.replace("/src/main.tsx", "/src/main.js"));
            writeFileSync(
                join(root, "src", "main.js"),
                "fetch(`${import.meta.env.VITE_OIDC_ISSUER}/token`);\n",
            );
            writeFileSync(
                join(root, ".env"),
                "VITE_API_URL=https://api.example.com/v1\nVITE_OIDC_ISSUER=https://sso.example.com/realms/app\n",
            );
            let reported: TempestCspPolicy | undefined;
            await build({
                root,
                configFile: false,
                logLevel: "silent",
                plugins: [tempestCsp({ onPolicy: (p) => (reported = p) })],
            });
            const html = readFileSync(join(root, "dist", "index.html"), "utf8");
            expect(reported?.command).toBe("build");
            expect(html).toContain(`content="${reported!.meta}"`);
            expect(reported!.directives["connect-src"]).toEqual(
                expect.arrayContaining(["https://api.example.com", "https://sso.example.com"]),
            );
            expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }, 30_000);
});
