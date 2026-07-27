import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tempest.mjs");

let root;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-doctor-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Write a file under the fixture, creating parent directories. */
function write(rel, contents) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
}

/** Fake an installed package so `installedVersion` finds it. */
function installed(name, version, extra = {}) {
    write(`node_modules/${name}/package.json`, { name, version, ...extra });
}

/**
 * Run the real CLI in the fixture directory.
 *
 * A subprocess rather than an imported function on purpose: `doctor` reads
 * `process.cwd()` and reports through the exit code, and the exit code is the part
 * that matters most — it decides whether a project "fails" the audit. Only running
 * it the way a user does tests that.
 */
function doctor() {
    const result = spawnSync(process.execPath, [CLI, "doctor"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

/** A plain, healthy React + Vite app that has never heard of the SDK. */
function thirdPartyApp() {
    write("package.json", {
        name: "app-de-terceiro",
        type: "module",
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^7.0.0", "@vitejs/plugin-react": "^5.0.0", eslint: "^9.0.0" },
    });
    write("tsconfig.json", {
        compilerOptions: { strict: true, jsx: "react-jsx", moduleResolution: "bundler" },
    });
    write(
        "vite.config.ts",
        'import { defineConfig } from "vite";\nexport default defineConfig({});',
    );
    write("src/App.tsx", "export const App = () => null;");
    write("package-lock.json", "{}");
    write("eslint.config.js", "export default [];");
    installed("react", "19.0.0");
    installed("react-dom", "19.0.0");
    installed("vite", "7.0.0");
    installed("@vitejs/plugin-react", "5.0.0");
    installed("eslint", "9.0.0");
    installed("prettier", "3.0.0");
    installed(".bin/eslint", "0.0.0");
}

describe("tempest doctor — a third-party project that does not use the SDK", () => {
    beforeEach(thirdPartyApp);

    it("does not fail the audit just for not having the SDK", () => {
        const { code, out } = doctor();
        expect(out).toContain("tempest-react-sdk not installed");
        expect(out).toContain("generic React/Vite health only");
        expect(code).toBe(0);
    });

    it("never reports the missing SDK as a problem", () => {
        const { out } = doctor();
        expect(out).not.toMatch(/✗.*tempest-react-sdk/);
    });

    it("drops the SDK's own conventions from the report", () => {
        const { out } = doctor();
        // The `@/*` alias and `createViteConfig` are preferences, not health.
        expect(out).not.toContain('tsconfig "@/*" alias');
        expect(out).not.toContain("not using createViteConfig");
        // The stylesheet is only *demanded* of an SDK project; the adoption hint at
        // the end still mentions it, which is the point of that section.
        expect(out).not.toContain('add import "tempest-react-sdk/styles.css"');
    });

    it("does not demand a src/main.tsx it has no reason to expect", () => {
        const { out } = doctor();
        expect(out).not.toContain("app entry");
    });

    it("explains moduleResolution without naming SDK subpaths", () => {
        write("tsconfig.json", { compilerOptions: { strict: true, jsx: "react-jsx" } });
        const { out } = doctor();
        expect(out).toContain("moduleResolution");
        expect(out).not.toContain("tempest-react-sdk/br");
        expect(out).toContain("subpath exports");
    });

    it("closes with how to adopt, so the audit is not a dead end", () => {
        const { out } = doctor();
        expect(out).toContain("Adopting the SDK (optional)");
        expect(out).toContain("npm i tempest-react-sdk");
        expect(out).toContain("not all-or-nothing");
    });
});

describe("tempest doctor — generic findings still surface", () => {
    it("flags a missing lockfile", () => {
        thirdPartyApp();
        rmSync(join(root, "package-lock.json"));
        expect(doctor().out).toContain("no lockfile");
    });

    it("flags a missing @vitejs/plugin-react", () => {
        thirdPartyApp();
        rmSync(join(root, "node_modules", "@vitejs", "plugin-react"), {
            recursive: true,
            force: true,
        });
        expect(doctor().out).toContain("@vitejs/plugin-react");
    });

    it("flags declared dependencies that are not installed", () => {
        thirdPartyApp();
        rmSync(join(root, "node_modules", "react"), { recursive: true, force: true });
        expect(doctor().out).toMatch(/dependency\(ies\) not installed/);
    });

    it("flags env vars that Vite will not expose", () => {
        thirdPartyApp();
        write("src/api.ts", "export const url = import.meta.env.API_URL;");
        expect(doctor().out).toContain("client env without VITE_ prefix");
    });

    it("still fails on a genuinely broken project", () => {
        write("package.json", { name: "broken", dependencies: {} });
        const { code, out } = doctor();
        expect(out).toContain("react + react-dom present");
        expect(code).toBe(1);
    });
});

describe("tempest doctor — a project on TypeScript 7", () => {
    /**
     * TypeScript 7 is the native port: same package name, and no classic compiler
     * API — it moved to `typescript/unstable/*`. Before this was detected, `doctor`
     * died with `ts.readConfigFile is not a function` on any such project, which is
     * the worst possible failure for the command people run first.
     */
    beforeEach(() => {
        thirdPartyApp();
        write("node_modules/typescript/package.json", {
            name: "typescript",
            version: "7.0.2",
            main: "index.js",
        });
        write(
            "node_modules/typescript/index.js",
            'module.exports = { version: "7.0.2", versionMajorMinor: "7.0" };',
        );
    });

    it("does not crash, and still reports the tsconfig checks", () => {
        const { out, code } = doctor();
        expect(out).not.toContain("is not a function");
        expect(out).toContain("moduleResolution: bundler");
        expect(code).toBe(0);
    });

    it("says the codemods are unavailable, and why", () => {
        const { out } = doctor();
        expect(out).toContain("no classic compiler API");
        expect(out).toContain("every other pass runs");
    });

    it("reads a tsconfig with comments through the fallback parser", () => {
        writeFileSync(
            join(root, "tsconfig.json"),
            '{\n  // vite default\n  "compilerOptions": { "strict": true, "jsx": "react-jsx", "moduleResolution": "bundler" },\n}\n',
        );
        const { out } = doctor();
        expect(out).toContain("strict mode on");
        expect(out).not.toContain("strict mode off");
    });
});

describe("tempest doctor — stylesheets", () => {
    beforeEach(thirdPartyApp);

    it("says nothing about CSS in a project with no stylesheet", () => {
        expect(doctor().out).not.toContain("Stylesheets");
    });

    it("reports a clean sheet as clean", () => {
        write("src/app.css", ".a {\n    color: red;\n}\n");
        const { out, code } = doctor();
        expect(out).toContain("Stylesheets");
        expect(out).toContain("no CSS problems found");
        expect(code).toBe(0);
    });

    it("fails the audit on CSS the browser cannot parse", () => {
        write("src/app.css", ".a {\n    color: red;\n");
        const { out, code } = doctor();
        expect(out).toContain("src/app.css:1");
        expect(out).toContain("never closed");
        expect(code).toBe(1);
    });

    it("warns without failing on CSS that is valid but wrong", () => {
        write("src/app.css", ".a {\n    bacground-color: red;\n}\n");
        const { out, code } = doctor();
        expect(out).toContain("did you mean `background-color`");
        expect(code).toBe(0);
    });

    it("points at the fix command when something is auto-fixable", () => {
        write("src/app.css", ".a {\n    color: red;\n    color: red;\n}\n");
        const { out } = doctor();
        expect(out).toMatch(/finding\(s\) are auto-fixable/);
    });

    it("suggests one global class over repeated local copies", () => {
        const row = ".row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n";
        write("src/A.module.css", row);
        write("src/B.module.css", row);
        write("src/C.module.css", row);
        expect(doctor().out).toContain("one global class beats");
    });
});

describe("tempest doctor — a project that does use the SDK", () => {
    beforeEach(() => {
        thirdPartyApp();
        write("package.json", {
            name: "sdk-app",
            type: "module",
            dependencies: {
                "tempest-react-sdk": "^0.26.1",
                react: "^19.0.0",
                "react-dom": "^19.0.0",
            },
        });
        installed("tempest-react-sdk", "0.26.1", { dependencies: { "lucide-react": "^1.26.0" } });
        installed("lucide-react", "1.26.0");
    });

    it("checks the SDK's conventions again", () => {
        write("tsconfig.json", {
            compilerOptions: { strict: true, jsx: "react-jsx", moduleResolution: "bundler" },
        });
        const { out } = doctor();
        expect(out).toContain('tsconfig "@/*" alias');
    });

    it("asks for the stylesheet import, which is a real defect without it", () => {
        write("src/main.tsx", "export const main = 1;");
        expect(doctor().out).toContain("styles.css");
    });

    it("omits the adoption hint — it has already adopted", () => {
        expect(doctor().out).not.toContain("Adopting the SDK (optional)");
    });

    it("warns when the SDK is installed but undeclared", () => {
        write("package.json", {
            name: "sdk-app",
            dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        });
        const { out, code } = doctor();
        expect(out).toContain("tempest-react-sdk not in dependencies");
        // Undeclared-but-present is a warning, not a blocking failure.
        expect(code).toBe(0);
    });
});
