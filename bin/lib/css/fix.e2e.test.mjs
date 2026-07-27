import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tempest.mjs");

let root;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-fix-css-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Write a file under the fixture, creating parent directories. */
function write(rel, contents) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return path;
}

/**
 * Run `tempest fix` in the fixture.
 *
 * `--no-alias` keeps the run to the CSS pass: the alias pass needs TypeScript and
 * a `paths` entry, neither of which this fixture has, and its "skipping" notice
 * would be the loudest line in the output.
 */
function fix(args = []) {
    const result = spawnSync(process.execPath, [CLI, "fix", "--no-alias", ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("tempest fix — the CSS pass", () => {
    it("removes dead declarations and reports each one", () => {
        const file = write("src/app.css", ".a {\n    color: red;\n    color: red;\n}\n");
        const { out } = fix();
        expect(out).toContain("→ css");
        expect(out).toContain("removed duplicate `color`");
        expect(readFileSync(file, "utf8")).toBe(".a {\n    color: red;\n}\n");
    });

    it("writes nothing under --dry-run", () => {
        const before = ".a {\n    color: red;\n    color: red;\n}\n";
        const file = write("src/app.css", before);
        const { out } = fix(["--dry-run"]);
        expect(out).toContain("would remove 1");
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("lists the findings a human has to resolve", () => {
        write("src/app.css", ".a {\n    color: red;\n    color: blue;\n}\n");
        const { out } = fix(["--dry-run"]);
        expect(out).toContain("overrides");
        expect(out).toContain("nothing to remove");
    });

    it("refuses to write to a sheet with a syntax error, and exits non-zero", () => {
        const before = ".a {\n    color: red;\n    color: red;\n";
        const file = write("src/app.css", before);
        const { out, code } = fix();
        expect(out).toContain("CSS syntax error(s)");
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(code).toBe(1);
    });

    it("honors a path argument", () => {
        const touched = write("src/a.css", ".a {\n    color: red;\n    color: red;\n}\n");
        const other = write("src/b.css", ".b {\n    color: red;\n    color: red;\n}\n");
        fix([join("src", "a.css")]);
        expect(readFileSync(touched, "utf8")).toBe(".a {\n    color: red;\n}\n");
        expect(readFileSync(other, "utf8")).toContain("color: red;\n    color: red;");
    });

    it("skips the pass entirely with --no-css", () => {
        const before = ".a {\n    color: red;\n    color: red;\n}\n";
        const file = write("src/app.css", before);
        const { out } = fix(["--no-css", "--dry-run"]);
        expect(out).not.toContain("→ css");
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("rejects an unknown flag instead of forwarding it", () => {
        const { out, code } = fix(["--no-such-flag"]);
        expect(out).toContain("Unknown flag for fix");
        expect(code).toBe(1);
    });
});

const TYPESCRIPT_DIR = dirname(createRequire(import.meta.url).resolve("typescript/package.json"));

/**
 * A fixture with two modules declaring the same block, each read from its own
 * component, plus the global sheet the entry imports and the project's own
 * TypeScript — everything `--extract-css` refuses to work without.
 */
function extractableProject() {
    const rule =
        ".row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n.title {\n    font-weight: 600;\n}\n";
    writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "fixture", devDependencies: { typescript: "^5" } }),
    );
    write(
        "tsconfig.json",
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
    );
    write("src/index.css", ":root {\n    --brand: #0d6efd;\n}\n");
    write("src/main.tsx", 'import "./index.css";\n');
    write("src/components/Card.module.css", rule);
    write(
        "src/components/Card.tsx",
        'import styles from "./Card.module.css";\n\nexport const Card = () => (\n  <div className={styles.row}>\n    <b className={styles.title} />\n  </div>\n);\n',
    );
    write("src/components/List.module.css", rule.replace(".row", ".line"));
    write(
        "src/components/List.tsx",
        'import styles from "@/components/List.module.css";\n\nexport const List = () => (\n  <li className={styles.line}>\n    <b className={styles.title} />\n  </li>\n);\n',
    );
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(TYPESCRIPT_DIR, join(root, "node_modules", "typescript"), "dir");
}

describe("tempest fix --extract-css", () => {
    it("moves the repeated block into the global sheet and rewrites the JSX", () => {
        extractableProject();
        const { out } = fix(["--extract-css"]);
        expect(out).toContain("css extract");
        expect(out).toContain("movidas 2 regra(s)");
        expect(readFileSync(join(root, "src/index.css"), "utf8")).toContain(".u-row {");
        expect(readFileSync(join(root, "src/components/Card.tsx"), "utf8")).toContain(
            'className="u-row"',
        );
        expect(readFileSync(join(root, "src/components/Card.module.css"), "utf8")).not.toContain(
            ".row",
        );
    });

    it("writes nothing under --dry-run", () => {
        extractableProject();
        const before = readFileSync(join(root, "src/components/Card.tsx"), "utf8");
        const { out } = fix(["--extract-css", "--dry-run"]);
        expect(out).toContain("moveria 2 regra(s)");
        expect(readFileSync(join(root, "src/components/Card.tsx"), "utf8")).toBe(before);
    });

    it("honors --css-prefix without treating its value as a path", () => {
        extractableProject();
        fix(["--extract-css", "--css-prefix", "shared-"]);
        expect(readFileSync(join(root, "src/index.css"), "utf8")).toContain(".shared-row {");
    });

    it("does nothing extra when the flag is absent", () => {
        extractableProject();
        const { out } = fix([]);
        expect(out).not.toContain("css extract");
        expect(readFileSync(join(root, "src/index.css"), "utf8")).not.toContain(".u-row");
    });

    it("rejects --css-target without --extract-css", () => {
        extractableProject();
        const { out, code } = fix(["--css-target", "src/index.css"]);
        expect(out).toContain("só valem com --extract-css");
        expect(code).toBe(1);
    });

    it("reports the reason instead of extracting what it cannot prove safe", () => {
        extractableProject();
        write(
            "src/components/Card.module.css",
            ".row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n.row:hover {\n    opacity: 0.8;\n}\n.title {\n    font-weight: 600;\n}\n",
        );
        const { out } = fix(["--extract-css"]);
        expect(out).toContain("não extraído");
        expect(out).toContain("nada a extrair");
        expect(readFileSync(join(root, "src/index.css"), "utf8")).not.toContain(".u-row");
    });
});
