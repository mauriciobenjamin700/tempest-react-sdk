import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { VITEST_CONFIG_FILES, checkVitest } from "./vitest.mjs";

const VITEST_CHUNKS = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "node_modules",
    "vitest",
    "dist",
    "chunks",
);

/** Statuses of the returned rows, in order. */
const statuses = (rows) => rows.map(([status]) => status);

/** Run the check for a project with Vitest and the given config files. */
const check = (configs) => checkVitest({ vitestInstalled: true, configs });

/**
 * The config file list the installed Vitest really searches, read from its source.
 *
 * @returns {string[]} `CONFIG_NAMES` × `CONFIG_EXTENSIONS`, in Vitest's order.
 */
function installedVitestConfigFiles() {
    const file = readdirSync(VITEST_CHUNKS).find((name) => /^constants\..*\.js$/.test(name));
    const text = readFileSync(join(VITEST_CHUNKS, file), "utf8");
    const array = (name) =>
        JSON.parse(
            new RegExp(`const ${name} = (\\[[^\\]]*\\])`)
                .exec(text)[1]
                .replace(/\s+/g, "")
                .replace(/,]/, "]"),
        );
    return array("CONFIG_NAMES").flatMap((name) =>
        array("CONFIG_EXTENSIONS").map((ext) => name + ext),
    );
}

describe("checkVitest — which file it judges", () => {
    it("searches the same files, in the same order, as the installed Vitest", () => {
        expect(VITEST_CONFIG_FILES).toEqual(installedVitestConfigFiles());
    });

    it("judges vitest.config over vite.config, the one Vitest loads", () => {
        const rows = check({
            "vite.config.ts": "export default createViteConfig();",
            "vitest.config.ts": "export default defineConfig({ test: {} });",
        });
        expect(statuses(rows)).toEqual(["warn"]);
        expect(rows[0][1]).toContain("vitest.config.ts");
    });

    it("falls back to vite.config when there is no vitest.config", () => {
        const rows = check({ "vite.config.mjs": "export default defineConfig({});" });
        expect(rows[0][1]).toContain("vite.config.mjs");
    });
});

describe("checkVitest — setups that fail the suite", () => {
    it("says nothing when the project does not use Vitest", () => {
        expect(checkVitest({ vitestInstalled: false, configs: {} })).toEqual([]);
    });

    it("warns when Vitest would run with no config at all", () => {
        const rows = check({});
        expect(statuses(rows)).toEqual(["warn"]);
        expect(rows[0][2]).toContain("tempestVitest()");
        expect(rows[0][2]).toContain('Unknown file extension ".css"');
    });

    it("warns on a plain vitest.config without the plugin", () => {
        const rows = check({
            "vitest.config.ts":
                'import { defineConfig } from "vitest/config";\n' +
                'export default defineConfig({ test: { environment: "jsdom" } });',
        });
        expect(statuses(rows)).toEqual(["warn"]);
    });

    it("does not count the plugin named only in a comment", () => {
        const rows = check({
            "vitest.config.ts":
                "// TODO: add tempestVitest()\n/* createViteConfig later */\n" +
                "export default defineConfig({});",
        });
        expect(statuses(rows)).toEqual(["warn"]);
    });

    it("does not trust an import of a vite.config that lacks the plugin too", () => {
        const rows = check({
            "vite.config.ts": "export default defineConfig({});",
            "vitest.config.ts":
                'import viteConfig from "./vite.config";\n' +
                "export default mergeConfig(viteConfig, defineConfig({ test: {} }));",
        });
        expect(statuses(rows)).toEqual(["warn"]);
    });
});

describe("checkVitest — setups that pass", () => {
    it.each([
        ["tempestVitest()", "export default defineConfig({ plugins: [tempestVitest()] });"],
        ["createViteConfig", "export default createViteConfig({ overrides: {} });"],
        [
            "inline: true",
            "export default defineConfig({ test: { server: { deps: { inline: true } } } });",
        ],
        [
            "an inline list naming the SDK",
            'export default defineConfig({ test: { server: { deps: { inline: ["x", "tempest-react-sdk"] } } } });',
        ],
    ])("accepts %s", (_, text) => {
        expect(statuses(check({ "vitest.config.ts": text }))).toEqual(["ok"]);
    });

    it("accepts a vitest.config merged over a vite.config that uses createViteConfig", () => {
        const rows = check({
            "vite.config.ts": "export default createViteConfig();",
            "vitest.config.ts":
                'import viteConfig from "./vite.config.ts";\n' +
                "export default mergeConfig(viteConfig, defineConfig({ test: {} }));",
        });
        expect(statuses(rows)).toEqual(["ok"]);
    });

    it("keeps a URL inside a string from hiding a marker after it", () => {
        const rows = check({
            "vitest.config.ts":
                'const docs = "https://example.com"; export default defineConfig({ plugins: [tempestVitest()] });',
        });
        expect(statuses(rows)).toEqual(["ok"]);
    });
});
