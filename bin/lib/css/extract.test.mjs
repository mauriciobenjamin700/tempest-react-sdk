import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeCss } from "./analyze.mjs";
import { applyExtraction, classNamesIn, kebab, loneClass, planExtraction } from "./extract.mjs";
import { parseCss } from "./parse.mjs";

const SELF_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
const TYPESCRIPT_DIR = dirname(createRequire(import.meta.url).resolve("typescript/package.json"));

let root;

/** Write a file inside the fixture project, creating its directory. */
function write(rel, text) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
}

const ROW = `.row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.title {
    font-weight: 600;
}
`;

/**
 * A minimal project the codemod can act on: a tsconfig with the `@/*` alias, a
 * global stylesheet that the entry imports, and the project's own TypeScript
 * (symlinked, because the CLI resolves the compiler from the project on purpose).
 */
function project() {
    write("package.json", JSON.stringify({ name: "fixture" }));
    write(
        "tsconfig.json",
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
    );
    write("src/index.css", ":root {\n    --brand: #0d6efd;\n}\n");
    write("src/main.tsx", 'import "./index.css";\n');
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(TYPESCRIPT_DIR, join(root, "node_modules", "typescript"), "dir");
}

/** Two modules declaring the same block, each used from its own component. */
function twoCopies() {
    write("src/components/Card.module.css", ROW);
    write(
        "src/components/Card.tsx",
        'import styles from "./Card.module.css";\n\nexport const Card = () => (\n  <div className={styles.row}>\n    <b className={styles.title}>x</b>\n  </div>\n);\n',
    );
    write("src/components/List.module.css", ROW.replace(".row", ".line"));
    write(
        "src/components/List.tsx",
        'import styles from "@/components/List.module.css";\n\nexport const List = () => (\n  <li className={styles.line}>\n    <b className={styles.title}>x</b>\n  </li>\n);\n',
    );
}

const plan = (options = {}) =>
    planExtraction({
        analysis: analyzeCss({ root, targets: ["."], selfDir: SELF_DIR }),
        root,
        ...options,
    });

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-extract-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("helpers", () => {
    it("recognizes a lone class selector and rejects anything else", () => {
        expect(loneClass(".row")).toBe("row");
        expect(loneClass("  .card-header ")).toBe("card-header");
        expect(loneClass(".row:hover")).toBeNull();
        expect(loneClass(".a .b")).toBeNull();
        expect(loneClass(".a.b")).toBeNull();
        expect(loneClass("div")).toBeNull();
    });

    it("kebab-cases a camelCase class name", () => {
        expect(kebab("cardHeader")).toBe("card-header");
        expect(kebab("row")).toBe("row");
        expect(kebab("grid_2")).toBe("grid-2");
    });

    it("collects every class a sheet defines", () => {
        const parsed = parseCss(".a .b { color: red; }\n.c:hover { color: blue; }\n");
        expect(classNamesIn(parsed)).toEqual(new Set(["a", "b", "c"]));
    });
});

describe("planExtraction — the happy path", () => {
    beforeEach(() => {
        project();
        twoCopies();
    });

    it("plans one global class from two modules, with every call site", () => {
        const result = plan();
        expect(result.status).toBe("ok");
        expect(result.target.file).toBe(join("src", "index.css"));
        expect(result.groups).toHaveLength(1);

        const [group] = result.groups;
        expect(group.name).toBe("u-row");
        expect(group.decls.map((d) => d.prop)).toEqual(["display", "align-items", "gap"]);
        expect(group.occurrences.map((o) => o.className).sort()).toEqual(["line", "row"]);
        expect(group.occurrences.flatMap((o) => o.sites)).toHaveLength(2);
    });

    it("honors --css-prefix", () => {
        expect(plan({ prefix: "shared-" }).groups[0].name).toBe("shared-row");
    });

    it("honors an explicit --css-target", () => {
        write("src/styles/app.css", "");
        write("src/main.tsx", 'import "./styles/app.css";\n');
        expect(plan({ target: "src/styles/app.css" }).target.file).toBe(
            join("src", "styles", "app.css"),
        );
    });
});

describe("applyExtraction", () => {
    beforeEach(() => {
        project();
        twoCopies();
    });

    it("moves the rule, deletes the local copies and rewrites the JSX", () => {
        const result = applyExtraction({ plan: plan() });
        expect(result.moved).toBe(2);
        expect(result.rules).toBe(1);

        const global = readFileSync(join(root, "src/index.css"), "utf8");
        expect(global).toContain(".u-row {");
        expect(global).toContain("align-items: center;");
        expect(global).toContain("extraído por");

        const card = readFileSync(join(root, "src/components/Card.module.css"), "utf8");
        expect(card).not.toContain(".row");
        expect(card).toContain(".title");

        // `className={styles.row}` loses the braces; the other class is untouched.
        const tsx = readFileSync(join(root, "src/components/Card.tsx"), "utf8");
        expect(tsx).toContain('<div className="u-row">');
        expect(tsx).toContain("{styles.title}");
    });

    it("writes nothing on a dry run", () => {
        const before = readFileSync(join(root, "src/components/Card.tsx"), "utf8");
        const result = applyExtraction({ plan: plan(), dryRun: true });
        expect(result.moved).toBe(2);
        expect(readFileSync(join(root, "src/components/Card.tsx"), "utf8")).toBe(before);
        expect(readFileSync(join(root, "src/index.css"), "utf8")).not.toContain(".u-row");
    });

    it("leaves nothing to do on a second run", () => {
        applyExtraction({ plan: plan() });
        expect(plan().groups).toEqual([]);
    });

    it("rewrites a class read through a string index", () => {
        write(
            "src/components/List.tsx",
            'import styles from "./List.module.css";\n\nexport const List = () => <li className={styles["line"]} />;\n',
        );
        applyExtraction({ plan: plan() });
        expect(readFileSync(join(root, "src/components/List.tsx"), "utf8")).toContain(
            'className="u-row"',
        );
    });

    it("keeps the surrounding call when the class is one argument of many", () => {
        write(
            "src/components/List.tsx",
            'import { cn } from "tempest-react-sdk";\nimport styles from "./List.module.css";\n\nexport const List = ({ on }: { on: boolean }) => (\n  <li className={cn(styles.line, on && styles.title)} />\n);\n',
        );
        applyExtraction({ plan: plan() });
        expect(readFileSync(join(root, "src/components/List.tsx"), "utf8")).toContain(
            'cn("u-row", on && styles.title)',
        );
    });
});

describe("planExtraction — refusals", () => {
    beforeEach(project);

    /** The reason attached to the first refusal, for a fixture built by the caller. */
    const refusal = () => plan().refusals[0]?.reason ?? "";

    it("refuses a class another rule in the same module mentions", () => {
        twoCopies();
        write("src/components/Card.module.css", `${ROW}.row:hover {\n    opacity: 0.8;\n}\n`);
        expect(refusal()).toContain("ficaria sem sujeito");
        expect(plan().groups).toEqual([]);
    });

    it("refuses a rule inside an at-rule", () => {
        twoCopies();
        write(
            "src/components/Card.module.css",
            `.title {\n    font-weight: 600;\n}\n@media (min-width: 600px) {\n    .row {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n    }\n}\n`,
        );
        expect(refusal()).toContain("mudaria quando a regra vale");
    });

    it("refuses when the module would be left empty", () => {
        twoCopies();
        write(
            "src/components/Card.module.css",
            ".row {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n",
        );
        expect(refusal()).toContain("única regra do módulo");
    });

    it("refuses a module used through a computed key", () => {
        twoCopies();
        write(
            "src/components/Card.tsx",
            'import styles from "./Card.module.css";\n\nexport const Card = ({ k }: { k: string }) => (\n  <div className={styles[k]}>\n    <b className={styles.row} />\n  </div>\n);\n',
        );
        expect(refusal()).toContain("não estática");
    });

    it("refuses a module whose styles object is passed around whole", () => {
        twoCopies();
        write(
            "src/components/Card.tsx",
            'import styles from "./Card.module.css";\n\nexport const Card = () => (\n  <div className={styles.row} data-keys={Object.keys(styles).length} />\n);\n',
        );
        expect(refusal()).toContain("usado inteiro");
    });

    it("refuses a class no source file reads", () => {
        twoCopies();
        write(
            "src/components/Card.tsx",
            'import styles from "./Card.module.css";\n\nexport const Card = () => <div className={styles.title} />;\n',
        );
        expect(refusal()).toContain("código morto");
    });

    it("needs the block in two different files", () => {
        write(
            "src/components/Card.module.css",
            `${ROW}.other {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n`,
        );
        write(
            "src/components/Card.tsx",
            'import styles from "./Card.module.css";\n\nexport const Card = () => (\n  <div className={styles.row}>\n    <b className={styles.other} />\n    <i className={styles.title} />\n  </div>\n);\n',
        );
        expect(plan().groups).toEqual([]);
    });

    it("refuses when the new name is already taken in the global sheet", () => {
        twoCopies();
        write("src/index.css", ".u-row {\n    display: block;\n}\n");
        const result = plan();
        expect(result.groups).toEqual([]);
        expect(result.refusals[0].reason).toContain("já existe na folha global");
    });

    it("reports a missing global stylesheet instead of creating one", () => {
        twoCopies();
        rmSync(join(root, "src/index.css"));
        const result = plan();
        expect(result.status).toBe("no-target");
        expect(result.message).toContain("nenhuma folha global");
    });

    it("refuses a global stylesheet nobody imports", () => {
        twoCopies();
        write("src/main.tsx", "export const main = 1;\n");
        const result = plan();
        expect(result.status).toBe("no-target");
        expect(result.message).toContain("não é importada");
    });

    it("refuses a CSS Module as the target", () => {
        twoCopies();
        write("src/theme.module.css", ".x { color: red; }\n");
        const result = plan({ target: "src/theme.module.css" });
        expect(result.status).toBe("no-target");
        expect(result.message).toContain("é um CSS Module");
    });

    it("reports a missing TypeScript instead of guessing at the call sites", () => {
        twoCopies();
        rmSync(join(root, "node_modules", "typescript"), { recursive: true, force: true });
        const result = plan();
        expect(result.status).toBe("no-typescript");
    });
});
