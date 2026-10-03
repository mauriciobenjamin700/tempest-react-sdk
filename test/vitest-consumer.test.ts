import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * A Vitest suite in a consumer project, importing the SDK the way it is installed.
 *
 * Every component module imports its own stylesheet. Vitest externalizes an ESM
 * package from `node_modules` to plain Node, which has no loader for `.css`, so a
 * consumer test that imports the barrel dies with `Unknown file extension ".css"`
 * (#397). This suite pins both halves: that the default config really fails — the
 * reason `tempestVitest` exists — and that the plugin makes it pass.
 *
 * It runs against a fixture package named `tempest-react-sdk` rather than `dist/`,
 * because the suite runs before the build in CI. The packed tarball is exercised by
 * `scripts/smoke-vitest.sh` after the build.
 */
const ROOT = resolve(import.meta.dirname, "..");
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const PLUGIN = join(ROOT, "src", "vite", "tempest-vitest.ts");

/**
 * Write a consumer project whose dependency imports a stylesheet, and run Vitest on it.
 *
 * @param config - Body of the consumer's `vitest.config.mjs`, after the plugin import.
 * @returns The run output, failures included.
 */
function runConsumer(config: string): string {
    const dir = mkdtempSync(join(tmpdir(), "tempest-vitest-consumer-"));
    const pkg = join(dir, "node_modules", "tempest-react-sdk");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
        join(pkg, "package.json"),
        JSON.stringify({ name: "tempest-react-sdk", type: "module", main: "index.js" }),
    );
    writeFileSync(join(pkg, "sheet.css"), ".a{color:red}");
    writeFileSync(join(pkg, "index.js"), 'import "./sheet.css";\nexport const Button = "ok";\n');
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
        join(dir, "a.test.js"),
        'import { Button } from "tempest-react-sdk";\ntest("imports", () => expect(Button).toBe("ok"));\n',
    );
    writeFileSync(
        join(dir, "vitest.config.mjs"),
        `import { tempestVitest } from ${JSON.stringify(PLUGIN)};\n${config}\n`,
    );
    try {
        return execFileSync(process.execPath, [VITEST, "run", "--root", dir], {
            cwd: dir,
            encoding: "utf8",
            stdio: "pipe",
            env: { ...process.env, CI: "1", NO_COLOR: "1" },
        });
    } catch (error) {
        const shaped = error as { stdout?: string; stderr?: string };
        return `${shaped.stdout ?? ""}${shaped.stderr ?? ""}`;
    }
}

const GLOBALS = "globals: true";

describe("a consumer Vitest suite importing the SDK", () => {
    it("fails on the stylesheet import under the default config", () => {
        expect(runConsumer(`export default { test: { ${GLOBALS} } };`)).toContain(
            'Unknown file extension ".css"',
        );
    }, 30_000);

    it("passes with tempestVitest", () => {
        expect(
            runConsumer(`export default { plugins: [tempestVitest()], test: { ${GLOBALS} } };`),
        ).toMatch(/Tests\s+1 passed/);
    }, 30_000);

    it("passes with tempestVitest next to an inline-everything config", () => {
        expect(
            runConsumer(
                `export default { plugins: [tempestVitest()], test: { ${GLOBALS}, server: { deps: { inline: true } } } };`,
            ),
        ).toMatch(/Tests\s+1 passed/);
    }, 30_000);
});
