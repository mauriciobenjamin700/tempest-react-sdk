import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { iconAliases } from "@/icons/generated/aliases";
import { iconNames } from "@/icons/generated/icon-names";

import {
    buildIconsModule,
    scanIconSlugs,
    TEMPEST_ICONS_ID,
    TEMPEST_ICONS_VIRTUAL_ID,
    tempestIcons,
} from "./tempest-icons";

/** The id the plugin resolves `virtual:tempest-icons` to (Rollup's `\0` convention). */
const RESOLVED_VIRTUAL_ID = `\0${TEMPEST_ICONS_VIRTUAL_ID}`;

const known = new Set<string>(iconNames);

describe("scanIconSlugs", () => {
    it("finds a literal name prop", () => {
        expect(scanIconSlugs(`<Icon name="save" />`, known)).toEqual(["save"]);
    });
    it("finds a braced literal", () => {
        expect(scanIconSlugs(`<Icon name={"trash-2"} />`, known)).toEqual(["trash-2"]);
    });
    it("finds an object field, as used in a nav config", () => {
        expect(scanIconSlugs(`{ label: "Home", name: "house" }`, known)).toEqual(["house"]);
    });
    it("finds a deprecated alias", () => {
        expect(scanIconSlugs(`<Icon name="alert-circle" />`, known)).toEqual(["alert-circle"]);
    });
    it("deduplicates repeats", () => {
        expect(scanIconSlugs(`<Icon name="save" /><Icon name="save" />`, known)).toEqual(["save"]);
    });
    it("ignores a name that is not a real slug", () => {
        expect(scanIconSlugs(`<Field name="email" /><Route name="user-list" />`, known)).toEqual(
            [],
        );
    });
    it("ignores a dynamic name", () => {
        expect(scanIconSlugs(`<Icon name={row.icon} />`, known)).toEqual([]);
    });
    it("ignores a slug-looking string that is not in a name position", () => {
        expect(scanIconSlugs(`const cls = "save"; t("save");`, known)).toEqual([]);
    });
});

describe("buildIconsModule", () => {
    it("emits static named imports and the slug table", () => {
        expect(buildIconsModule(["save", "shopping-cart"], iconAliases)).toBe(
            `import { Save, ShoppingCart } from "lucide-react";

export const staticIcons = {
    "save": Save,
    "shopping-cart": ShoppingCart,
};
`,
        );
    });
    it("imports the canonical component but keys it by the alias too", () => {
        const out = buildIconsModule(["alert-circle", "circle-alert"], iconAliases);
        expect(out).toContain(`import { CircleAlert } from "lucide-react";`);
        expect(out).toContain(`"alert-circle": CircleAlert,`);
        expect(out).toContain(`"circle-alert": CircleAlert,`);
    });
    it("PascalCases a leading single letter", () => {
        expect(buildIconsModule(["a-arrow-down"], iconAliases)).toContain(
            `import { AArrowDown } from "lucide-react";`,
        );
    });
    it("keeps digits attached, matching lucide's export names", () => {
        expect(buildIconsModule(["heading-1", "grid-2x2"], iconAliases)).toContain(
            `import { Grid2x2, Heading1 } from "lucide-react";`,
        );
    });
    it("emits an empty registry rather than an empty import", () => {
        expect(buildIconsModule([], iconAliases)).toBe("export const staticIcons = {};\n");
    });
    it("is deterministic regardless of input order", () => {
        expect(buildIconsModule(["shopping-cart", "save"], iconAliases)).toBe(
            buildIconsModule(["save", "shopping-cart"], iconAliases),
        );
    });
    it("derives only export names lucide really has, for all 2065 slugs", async () => {
        const lucide = (await import("lucide-react")) as unknown as Record<string, unknown>;
        const out = buildIconsModule([...iconNames], iconAliases);
        const named = /^import \{ (.+) \} from "lucide-react";$/m.exec(out)?.[1].split(", ") ?? [];
        const imported = named.map((entry) => entry.split(" as ")[0]);

        expect(imported.length).toBe(1807);
        const missing = imported.filter((name) => lucide[name] === undefined);
        expect(missing).toEqual([]);
    });

    it("aliases an export name that would shadow a restricted global", () => {
        const out = buildIconsModule(["infinity"], iconAliases);
        expect(out).toContain(`import { Infinity as InfinityIcon } from "lucide-react";`);
        expect(out).toContain(`"infinity": InfinityIcon,`);
    });
});

describe("tempestIcons — plugin", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "tempest-icons-"));
        mkdirSync(join(root, "src", "pages"), { recursive: true });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    /** Write a source file under the fixture root. */
    function write(rel: string, contents: string): void {
        const path = join(root, rel);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, contents);
    }

    /** Run the plugin's discovery and return the generated module source. */
    async function generate(options?: Parameters<typeof tempestIcons>[0]): Promise<string> {
        const plugin = tempestIcons(options) as unknown as {
            configResolved: (config: { root: string }) => void;
            buildStart: () => Promise<void>;
            resolveId: (id: string) => string | null;
            load: (id: string) => string | null;
        };
        plugin.configResolved({ root });
        await plugin.buildStart();
        const resolved = plugin.resolveId(TEMPEST_ICONS_ID);
        expect(resolved).toBeTruthy();
        return plugin.load(resolved as string) ?? "";
    }

    it("collects slugs from the source tree", async () => {
        write("src/pages/Home.tsx", `<Icon name="house" />`);
        write("src/pages/Users.tsx", `<Icon name="users" />`);
        const out = await generate();
        expect(out).toContain(`import { House, Users } from "lucide-react";`);
    });

    it("scans nested directories", async () => {
        write("src/pages/admin/deep/Panel.tsx", `<Icon name="settings" />`);
        expect(await generate()).toContain(`"settings": Settings,`);
    });

    it("skips node_modules and dist inside the scanned directory", async () => {
        write("src/node_modules/dep/index.ts", `<Icon name="bug" />`);
        write("src/dist/out.js", `<Icon name="bomb" />`);
        write("src/App.tsx", `<Icon name="house" />`);
        const out = await generate();
        expect(out).not.toContain("Bug");
        expect(out).not.toContain("Bomb");
        expect(out).toContain("House");
    });

    it("ignores files outside the scanned directory", async () => {
        write("scripts/tool.ts", `<Icon name="wrench" />`);
        write("src/App.tsx", `<Icon name="house" />`);
        const out = await generate();
        expect(out).not.toContain("Wrench");
        expect(out).toContain("House");
    });

    it("honours a custom dir", async () => {
        write("app/App.tsx", `<Icon name="house" />`);
        expect(await generate({ dir: "app" })).toContain("House");
    });

    it("adds slugs from include that the scan cannot see", async () => {
        write("src/App.tsx", `<Icon name={dynamic} />`);
        expect(await generate({ include: ["rocket"] })).toContain(`"rocket": Rocket,`);
    });

    it("drops an invalid slug passed to include", async () => {
        write("src/App.tsx", "");
        expect(await generate({ include: ["not-an-icon"] })).toBe(
            "export const staticIcons = {};\n",
        );
    });

    it("emits an empty registry when nothing references an icon", async () => {
        write("src/App.tsx", `export const App = () => null;`);
        expect(await generate()).toBe("export const staticIcons = {};\n");
    });

    it("leaves any other module id alone", () => {
        const plugin = tempestIcons() as unknown as {
            resolveId: (id: string) => string | null;
            load: (id: string) => string | null;
        };
        expect(plugin.resolveId("react")).toBeNull();
        expect(plugin.load("react")).toBeNull();
    });

    it("claims the package subpath, so the shipped stub never wins", () => {
        const plugin = tempestIcons() as unknown as {
            resolveId: (id: string) => string | null;
        };
        expect(plugin.resolveId("tempest-react-sdk/icons/virtual")).toBe(RESOLVED_VIRTUAL_ID);
    });

    it("still claims the legacy virtual id", () => {
        const plugin = tempestIcons() as unknown as {
            resolveId: (id: string) => string | null;
        };
        expect(plugin.resolveId("virtual:tempest-icons")).toBe(RESOLVED_VIRTUAL_ID);
    });
});

describe("tempestIcons — dev-server updates", () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "tempest-icons-hmr-"));
        mkdirSync(join(root, "src"), { recursive: true });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    /** The plugin's hooks, typed just enough to drive them directly. */
    function plugin(options?: Parameters<typeof tempestIcons>[0]) {
        return tempestIcons(options) as unknown as {
            configResolved: (config: { root?: string }) => void;
            buildStart: () => Promise<void>;
            load: (id: string) => string | null;
            handleHotUpdate: (ctx: {
                file: string;
                read: () => Promise<string>;
                server: { moduleGraph: { getModuleById: (id: string) => unknown } };
            }) => Promise<unknown>;
        };
    }

    const virtualModule = { id: RESOLVED_VIRTUAL_ID };
    const server = {
        moduleGraph: {
            getModuleById: (id: string) => (id === RESOLVED_VIRTUAL_ID ? virtualModule : null),
        },
    };

    it("invalidates the virtual module when a file adds a new slug", async () => {
        writeFileSync(join(root, "src", "App.tsx"), "");
        const p = plugin();
        p.configResolved({ root });
        await p.buildStart();

        const result = await p.handleHotUpdate({
            file: join(root, "src", "App.tsx"),
            read: async () => `<Icon name="rocket" />`,
            server,
        });

        expect(result).toEqual([virtualModule]);
        expect(p.load(RESOLVED_VIRTUAL_ID)).toContain(`"rocket": Rocket,`);
    });

    it("leaves the module alone when nothing new appeared", async () => {
        writeFileSync(join(root, "src", "App.tsx"), `<Icon name="rocket" />`);
        const p = plugin();
        p.configResolved({ root });
        await p.buildStart();

        const result = await p.handleHotUpdate({
            file: join(root, "src", "App.tsx"),
            read: async () => `<Icon name="rocket" />`,
            server,
        });

        expect(result).toBeUndefined();
    });

    it("ignores a changed file that is not source", async () => {
        const p = plugin();
        p.configResolved({ root });
        const read = vi.fn();
        const result = await p.handleHotUpdate({
            file: join(root, "src", "styles.css"),
            read,
            server,
        });
        expect(result).toBeUndefined();
        expect(read).not.toHaveBeenCalled();
    });

    it("falls back to the cwd when the config carries no root", async () => {
        const p = plugin({ dir: "does-not-exist" });
        p.configResolved({});
        await p.buildStart();
        expect(p.load(RESOLVED_VIRTUAL_ID)).toBe("export const staticIcons = {};\n");
    });

    it("survives a directory it cannot read", async () => {
        const p = plugin({ dir: "nope" });
        p.configResolved({ root });
        await expect(p.buildStart()).resolves.toBeUndefined();
        expect(p.load(RESOLVED_VIRTUAL_ID)).toBe("export const staticIcons = {};\n");
    });
});
