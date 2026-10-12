import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { componentFiles, normalizeComponentName } from "./generate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const CLI = join(REPO, "bin", "tempest.mjs");
const TEMPLATE = join(REPO, "template");
/**
 * Component names that collide with something a generated file declares or
 * imports: React built-in hooks (`use<Name>` would be `useMemo`), the `React`
 * namespace, and globals the component function would shadow.
 */
const COLLIDING = [
    "UserCard",
    "Memo",
    "State",
    "Effect",
    "Callback",
    "LayoutEffect",
    "React",
    "ReactMemo",
    "UseMemo",
    "Object",
    "Promise",
    "Error",
];
const FILES = ["constants.ts", "hooks.ts", "index.tsx", "styles.module.css", "utils.ts"];

describe("normalizeComponentName", () => {
    it.each([
        ["user card", "UserCard"],
        ["user-card", "UserCard"],
        ["user_card", "UserCard"],
        ["userCard", "UserCard"],
        ["UserCard", "UserCard"],
        ["  button  ", "Button"],
        ["api client", "ApiClient"],
        ["APIClient", "APIClient"],
        ["card2 header", "Card2Header"],
    ])("%j → %s", (raw, expected) => {
        expect(normalizeComponentName(raw)).toBe(expected);
    });

    it.each([
        ["", /Missing component name/],
        ["   ", /Missing component name/],
        ["2fa", /must start with a letter/],
        ["-card", /must start with a letter/],
        ["user/card", /use ASCII letters, digits/],
        ["../evil", /use ASCII letters, digits/],
        ['card"; alert(1)', /use ASCII letters, digits/],
        ["cartão", /use ASCII letters, digits/],
        ["con", /reserved device name on Windows/],
        ["NUL", /reserved device name on Windows/],
        ["aux", /reserved device name on Windows/],
        ["prn", /reserved device name on Windows/],
        ["com1", /reserved device name on Windows/],
        ["Lpt9", /reserved device name on Windows/],
    ])("refuses %j", (raw, message) => {
        expect(() => normalizeComponentName(raw)).toThrow(message);
    });
});

describe("componentFiles", () => {
    it("emits exactly the five files the issue asks for", () => {
        const { name, files } = componentFiles("user card");
        expect(name).toBe("UserCard");
        expect(Object.keys(files).sort()).toEqual(FILES);
    });

    it("wires every file into index.tsx so none starts as dead code", () => {
        const { files } = componentFiles("UserCard");
        expect(files["index.tsx"]).toContain('from "./hooks"');
        expect(files["index.tsx"]).toContain('from "./utils"');
        expect(files["index.tsx"]).toContain('from "./styles.module.css"');
        expect(files["hooks.ts"]).toContain('from "./constants"');
    });

    it("renames the hook when use<Name> is a React built-in hook", () => {
        expect(componentFiles("Memo").files["hooks.ts"]).toContain(
            "export function useMemoComponent(",
        );
        expect(componentFiles("State").files["index.tsx"]).toContain("useStateComponent(title)");
        expect(componentFiles("Card").files["hooks.ts"]).toContain("export function useCard(");
    });

    it("writes no comment and no single-quoted string", () => {
        const { files } = componentFiles("UserCard");
        for (const [file, contents] of Object.entries(files)) {
            expect(contents, file).not.toMatch(/\/\/|\/\*/);
            expect(contents, file).not.toContain("'");
        }
    });

    it.each(COLLIDING)(
        "passes the app template's ESLint config as generated for %s",
        async (componentName) => {
            const dir = mkdtempSync(join(tmpdir(), "tempest-component-lint-"));
            try {
                const { files } = componentFiles(componentName);
                for (const [file, contents] of Object.entries(files)) {
                    writeFileSync(join(dir, file), contents);
                }
                const eslint = new ESLint({
                    cwd: dir,
                    overrideConfigFile: join(TEMPLATE, "eslint.config.js"),
                });
                const results = await eslint.lintFiles(["*.ts", "*.tsx"]);
                const messages = results.flatMap((r) =>
                    r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId} ${m.message}`),
                );
                expect(results).toHaveLength(4);
                expect(messages).toEqual([]);
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        },
    );

    it.each(COLLIDING)(
        "type-checks %s under the app template's strict tsconfig",
        (componentName) => {
            const { files } = componentFiles(componentName);
            const tsconfig = ts.parseConfigFileTextToJson(
                "tsconfig.json",
                readFileSync(join(TEMPLATE, "tsconfig.json"), "utf8"),
            ).config;
            const { options } = ts.convertCompilerOptionsFromJson(
                { ...tsconfig.compilerOptions, types: [], paths: undefined },
                REPO,
            );
            const root = join(REPO, "__virtual_component__");
            const virtual = new Map(
                Object.entries(files)
                    .filter(([file]) => !file.endsWith(".css"))
                    .map(([file, contents]) => [join(root, file), contents]),
            );
            virtual.set(
                join(root, "css-modules.d.ts"),
                'declare module "*.module.css" {\n  const classes: Readonly<Record<string, string>>;\n  export default classes;\n}\n',
            );
            const host = ts.createCompilerHost(options);
            const readFile = host.readFile.bind(host);
            const fileExists = host.fileExists.bind(host);
            host.readFile = (f) => virtual.get(f) ?? readFile(f);
            host.fileExists = (f) => virtual.has(f) || fileExists(f);
            const directoryExists = host.directoryExists?.bind(host);
            host.directoryExists = (d) => d === root || (directoryExists?.(d) ?? true);
            const getSourceFile = host.getSourceFile.bind(host);
            host.getSourceFile = (f, lang) =>
                virtual.has(f)
                    ? ts.createSourceFile(f, virtual.get(f), lang)
                    : getSourceFile(f, lang);
            const program = ts.createProgram([...virtual.keys()], options, host);
            const diagnostics = ts
                .getPreEmitDiagnostics(program)
                .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
            expect(diagnostics).toEqual([]);
        },
    );
});

describe("tempest gen component (CLI)", () => {
    let cwd;

    beforeEach(() => {
        cwd = mkdtempSync(join(tmpdir(), "tempest-component-cli-"));
    });

    afterEach(() => {
        rmSync(cwd, { recursive: true, force: true });
    });

    /**
     * Run the `tempest` CLI in the temporary project.
     *
     * @param {string[]} args - CLI arguments.
     * @returns {{ status: number | null, out: string }}
     */
    function tempest(...args) {
        const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
        return { status: result.status, out: result.stdout + result.stderr };
    }

    it("creates src/components/<Name>/ with the five files by default", () => {
        const { status, out } = tempest("gen", "component", "user card");
        expect(status).toBe(0);
        expect(readdirSync(join(cwd, "src", "components", "UserCard")).sort()).toEqual(FILES);
        expect(out).toContain('import { UserCard } from "@/components/UserCard";');
    });

    it("accepts `tempest new component`, the spelling from the issue", () => {
        const { status } = tempest("new", "component", "Button");
        expect(status).toBe(0);
        expect(existsSync(join(cwd, "src", "components", "Button", "index.tsx"))).toBe(true);
    });

    it("refuses another `new` target instead of growing a second generator name", () => {
        const { status, out } = tempest("new", "api");
        expect(status).toBe(1);
        expect(out).toMatch(/Unknown new target: api/);
    });

    it("honors --out", () => {
        const { status, out } = tempest("gen", "component", "Card", "--out", "src/ui");
        expect(status).toBe(0);
        expect(existsSync(join(cwd, "src", "ui", "Card", "hooks.ts"))).toBe(true);
        expect(out).toContain('from "@/ui/Card"');
    });

    it("refuses to touch an existing folder without --force", () => {
        const dir = join(cwd, "src", "components", "Card");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.tsx"), "mine");

        const { status, out } = tempest("gen", "component", "Card");

        expect(status).toBe(1);
        expect(out).toMatch(/already exists.*--force/);
        expect(readFileSync(join(dir, "index.tsx"), "utf8")).toBe("mine");
    });

    it("--force rewrites the five files and leaves the rest of the folder alone", () => {
        const dir = join(cwd, "src", "components", "Card");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index.tsx"), "mine");
        writeFileSync(join(dir, "Card.test.tsx"), "keep");

        const { status } = tempest("gen", "component", "Card", "--force");

        expect(status).toBe(0);
        expect(readFileSync(join(dir, "index.tsx"), "utf8")).toContain("export function Card(");
        expect(readFileSync(join(dir, "Card.test.tsx"), "utf8")).toBe("keep");
    });

    it("refuses to write through a symlinked folder even with --force", () => {
        const outside = join(cwd, "outside");
        mkdirSync(outside);
        mkdirSync(join(cwd, "src", "components"), { recursive: true });
        symlinkSync(outside, join(cwd, "src", "components", "Card"));

        const { status, out } = tempest("gen", "component", "Card", "--force");

        expect(status).toBe(1);
        expect(out).toMatch(/symlink/);
        expect(readdirSync(outside)).toEqual([]);
    });

    it.each([
        [["gen", "component", "Card", "--out", "../x"], /outside the project/],
        [["gen", "component", "Card", "--out", "/tmp/tempest-outside-abs"], /outside the project/],
        [["gen", "component", "Card", "--out", "--force"], /--out needs a folder/],
        [["gen", "component", "Card", "--out"], /--out needs a folder/],
        [["gen", "component", "Card", "--out", ""], /--out needs a folder/],
    ])("refuses an --out of %j", (args, message) => {
        const { status, out } = tempest(...args);
        expect(status).toBe(1);
        expect(out).toMatch(message);
        expect(existsSync(join(cwd, "src"))).toBe(false);
        expect(existsSync(join(cwd, "--force"))).toBe(false);
        expect(existsSync(join(dirname(cwd), "x"))).toBe(false);
        expect(existsSync("/tmp/tempest-outside-abs")).toBe(false);
    });

    it("refuses an --out whose existing ancestor is a symlink leaving the project", () => {
        const outside = mkdtempSync(join(tmpdir(), "tempest-component-outside-"));
        try {
            mkdirSync(join(cwd, "src"));
            symlinkSync(outside, join(cwd, "src", "components"));

            const { status, out } = tempest("gen", "component", "Card");

            expect(status).toBe(1);
            expect(out).toMatch(/outside the project/);
            expect(readdirSync(outside)).toEqual([]);
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it("--force validates all five targets before writing any of them", () => {
        const dir = join(cwd, "src", "components", "Card");
        mkdirSync(join(dir, "utils.ts"), { recursive: true });
        writeFileSync(join(dir, "index.tsx"), "mine");

        const { status, out } = tempest("gen", "component", "Card", "--force");

        expect(status).toBe(1);
        expect(out).toMatch(/utils\.ts is not a regular file/);
        expect(readFileSync(join(dir, "index.tsx"), "utf8")).toBe("mine");
        expect(readdirSync(dir).sort()).toEqual(["index.tsx", "utils.ts"]);
    });

    it("prints the path with a warning instead of a wrong import outside src/", () => {
        const { status, out } = tempest("gen", "component", "Card", "--out", "lib/ui");
        expect(status).toBe(0);
        expect(out).not.toMatch(/import \{ Card \}/);
        expect(out).toMatch(/lib\/ui\/Card.*outside src\/.*@\//s);
    });

    it("keeps the @/ hint for a folder whose name merely starts with two dots", () => {
        const { status, out } = tempest("gen", "component", "Card", "--out", "src/..ui");
        expect(status).toBe(0);
        expect(out).toContain('import { Card } from "@/..ui/Card";');
    });

    it.each([
        [["gen", "component"], /Missing component name/],
        [["gen", "component", "2fa"], /must start with a letter/],
        [["gen", "component", "user", "card"], /Expected one component name, got 2/],
        [["gen", "component", "Card", "--dry-run"], /Unknown option: --dry-run/],
    ])("fails with a clear message for %j", (args, message) => {
        const { status, out } = tempest(...args);
        expect(status).toBe(1);
        expect(out).toMatch(message);
        expect(existsSync(join(cwd, "src"))).toBe(false);
    });
});
