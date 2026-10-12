import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { iconAliases, iconNames } from "@/icons";

import { generateRegistry, renderRegistry, scanIconSlugs } from "./generate.mjs";

const known = new Set(iconNames);

describe("scanIconSlugs", () => {
    it("finds literal name props, braced or not", () => {
        expect(
            scanIconSlugs(`<Icon name="save" /><Icon name={"trash-2"} />`, known).sort(),
        ).toEqual(["save", "trash-2"]);
    });
    it("finds an object field", () => {
        expect(scanIconSlugs(`{ name: "house" }`, known)).toEqual(["house"]);
    });
    it("ignores a name that is not a lucide slug", () => {
        expect(scanIconSlugs(`<Field name="email" />`, known)).toEqual([]);
    });
    it("ignores a dynamic name", () => {
        expect(scanIconSlugs(`<Icon name={row.icon} />`, known)).toEqual([]);
    });
});

describe("renderRegistry", () => {
    it("emits a createIconRegistry call with static imports", () => {
        const out = renderRegistry(["save", "shopping-cart"], iconAliases);
        expect(out).toContain(`import { createIconRegistry } from "tempest-react-sdk/icons";`);
        expect(out).toContain(`import { Save, ShoppingCart } from "lucide-react";`);
        expect(out).toContain(`    "save": Save,`);
    });
    it("imports the canonical component for an alias but keeps the alias key", () => {
        const out = renderRegistry(["alert-circle"], iconAliases);
        expect(out).toContain(`import { CircleAlert } from "lucide-react";`);
        expect(out).toContain(`    "alert-circle": CircleAlert,`);
    });
    it("emits an empty registry rather than an empty import", () => {
        expect(renderRegistry([], iconAliases)).toContain("createIconRegistry({})");
    });
    it("is deterministic regardless of input order", () => {
        expect(renderRegistry(["shopping-cart", "save"], iconAliases)).toBe(
            renderRegistry(["save", "shopping-cart"], iconAliases),
        );
    });
});

describe("generateRegistry", () => {
    let root;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "tempest-gen-icons-"));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    /** Write a source file under the fixture root. */
    function write(rel, contents) {
        const path = join(root, rel);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, contents);
    }

    it("collects slugs across a nested tree", async () => {
        write("pages/Home.tsx", `<Icon name="house" />`);
        write("pages/admin/Users.tsx", `<Icon name="users" />`);
        const { slugs, files } = await generateRegistry({ dir: root, known, aliases: iconAliases });
        expect(slugs).toEqual(["house", "users"]);
        expect(files).toBe(2);
    });

    it("skips node_modules, dist and dot directories", async () => {
        write("node_modules/dep/index.ts", `<Icon name="bug" />`);
        write("dist/out.js", `<Icon name="bomb" />`);
        write(".cache/x.ts", `<Icon name="box" />`);
        write("App.tsx", `<Icon name="house" />`);
        const { slugs } = await generateRegistry({ dir: root, known, aliases: iconAliases });
        expect(slugs).toEqual(["house"]);
    });

    it("adds include slugs and drops invalid ones", async () => {
        write("App.tsx", "");
        const { slugs } = await generateRegistry({
            dir: root,
            known,
            aliases: iconAliases,
            include: ["rocket", "not-an-icon"],
        });
        expect(slugs).toEqual(["rocket"]);
    });

    it("yields an empty registry for a tree with no icons", async () => {
        write("App.tsx", `export const App = () => null;`);
        const { slugs, source } = await generateRegistry({
            dir: root,
            known,
            aliases: iconAliases,
        });
        expect(slugs).toEqual([]);
        expect(source).toContain("createIconRegistry({})");
    });

    it("returns zero files for a directory that does not exist", async () => {
        const { files, slugs } = await generateRegistry({
            dir: join(root, "nope"),
            known,
            aliases: iconAliases,
        });
        expect(files).toBe(0);
        expect(slugs).toEqual([]);
    });
});

describe("renderRegistry — reserved names", () => {
    it("aliases an export name that would shadow a restricted global", () => {
        const out = renderRegistry(["infinity"], iconAliases);
        expect(out).toContain(`import { Infinity as InfinityIcon } from "lucide-react";`);
        expect(out).toContain(`"infinity": InfinityIcon,`);
    });
});

describe("loadIconTables in plain Node (#485)", () => {
    let pkg;

    beforeEach(() => {
        pkg = mkdtempSync(join(tmpdir(), "tempest-icon-tables-"));
    });

    afterEach(() => {
        rmSync(pkg, { recursive: true, force: true });
    });

    /**
     * Lay out a package the way `npm pack` ships it: a `dist/icons.js` barrel that
     * imports a stylesheet, as every component module has since 0.63.0, next to the
     * two pure data modules. Vitest would load the `.css` on its own, so the call
     * runs in a child `node` with no loader — exactly how the `tempest` bin runs.
     */
    function loadInPlainNode() {
        const dist = join(pkg, "dist");
        mkdirSync(join(dist, "icons", "generated"), { recursive: true });
        mkdirSync(join(pkg, "bin"));
        writeFileSync(join(dist, "icons", "IconPicker.css"), ".a{color:red}");
        writeFileSync(
            join(dist, "icons.js"),
            'import "./icons/IconPicker.css";\nexport const iconNames = [];\nexport const iconAliases = {};\n',
        );
        writeFileSync(
            join(dist, "icons", "generated", "icon-names.js"),
            'var e = ["check", "house"];\nexport { e as iconNames };\n',
        );
        writeFileSync(
            join(dist, "icons", "generated", "aliases.js"),
            'var e = { home: "house" };\nexport { e as iconAliases };\n',
        );
        const generator = join(dirname(fileURLToPath(import.meta.url)), "generate.mjs");
        const script = `const { loadIconTables } = await import(${JSON.stringify(generator)});
const t = await loadIconTables(${JSON.stringify(join(pkg, "bin"))});
console.log(JSON.stringify({ known: [...t.known], aliases: t.aliases }));`;
        return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
            encoding: "utf8",
        });
    }

    it("reads the tables without importing a stylesheet", () => {
        const result = loadInPlainNode();
        expect(result.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION/);
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
            known: ["check", "house"],
            aliases: { home: "house" },
        });
    });
});
