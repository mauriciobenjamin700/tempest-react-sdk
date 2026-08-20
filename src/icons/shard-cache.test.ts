import { describe, expect, it } from "vitest";

import { iconAliases } from "./generated/aliases";
import { iconShards } from "./generated/loaders";
import { iconNames } from "./generated/icon-names";
import { isIconName } from "./is-icon-name";
import { resolveIconAlias } from "./alias";
import { iconStatus, loadIcon, peekIcon, preloadIcons } from "./shard-cache";

describe("generated tables", () => {
    it("covers every lucide slug, canonical plus alias", () => {
        expect(iconNames.length).toBe(2024);
        expect(Object.keys(iconAliases).length).toBe(257);
    });
    it("splits the icons into balanced shards instead of by initial letter", () => {
        expect(iconShards.length).toBe(45);
        for (const shard of iconShards) expect(shard.size).toBeLessThanOrEqual(40);
        expect(iconShards.reduce((total, shard) => total + shard.size, 0)).toBe(1767);
    });

    it("keeps the shard bounds ascending in the order the lookup compares them", () => {
        /**
         * The lookup is a binary search using `<`, which is UTF-16 code-unit order.
         * A generator sorting with `localeCompare` would weight the hyphen
         * differently, and one divergence routes a slug to a shard that does not
         * hold it — a missing icon with no error anywhere.
         */
        for (let index = 1; index < iconShards.length; index += 1) {
            expect(iconShards[index - 1].from < iconShards[index].from).toBe(true);
        }
    });
    it("maps every alias to a canonical slug that is itself not an alias", () => {
        for (const [alias, canonical] of Object.entries(iconAliases)) {
            expect(iconNames).toContain(canonical);
            expect(iconAliases[canonical]).toBeUndefined();
            expect(alias).not.toBe(canonical);
        }
    });
    it("covers every canonical slug exactly once, in contiguous ranges", async () => {
        const seen = new Set<string>();

        for (const [index, shard] of iconShards.entries()) {
            const slugs = Object.keys((await shard.load()).default);
            const nextBound = iconShards[index + 1]?.from;

            expect(slugs.length).toBe(shard.size);
            expect(slugs[0]).toBe(shard.from);
            for (const slug of slugs) {
                expect(slug >= shard.from).toBe(true);
                if (nextBound !== undefined) expect(slug < nextBound).toBe(true);
                expect(seen.has(slug)).toBe(false);
                seen.add(slug);
            }
        }

        expect(seen.size).toBe(1767);
        for (const slug of iconNames) expect(seen.has(resolveIconAlias(slug))).toBe(true);
    });
});

describe("resolveIconAlias", () => {
    it("maps a deprecated alias to its canonical slug", () => {
        expect(resolveIconAlias("alert-circle")).toBe("circle-alert");
        expect(resolveIconAlias("alert-triangle")).toBe("triangle-alert");
    });
    it("returns a canonical slug untouched", () => {
        expect(resolveIconAlias("save")).toBe("save");
    });
    it("returns an unknown slug untouched", () => {
        expect(resolveIconAlias("not-an-icon")).toBe("not-an-icon");
    });
});

describe("loadIcon / peekIcon / iconStatus", () => {
    it("reports loading before the shard lands and ready after", async () => {
        expect(peekIcon("bird")).toBeUndefined();
        expect(iconStatus("bird")).toBe("loading");
        await loadIcon("bird");
        expect(iconStatus("bird")).toBe("ready");
        expect(peekIcon("bird")).toBeTypeOf("object");
    });

    it("resolves an alias through its canonical shard", async () => {
        await loadIcon("alert-octagon");
        expect(peekIcon("alert-octagon")).toBe(peekIcon("octagon-alert"));
    });

    it("collapses concurrent loads of one shard into a single import", async () => {
        const first = loadIcon(iconShards[20].from);
        const second = loadIcon(iconShards[20].from);
        expect(second).toBe(first);
        await first;
    });

    it("brings in the whole range around a slug, not just that icon", async () => {
        const shard = iconShards[30];
        const slugs = Object.keys((await shard.load()).default);
        await loadIcon(shard.from);
        expect(peekIcon(slugs[slugs.length - 1])).toBeTypeOf("object");
    });

    it("reports missing without a fetch for a slug that sorts before every icon", () => {
        expect(iconStatus("0-not-an-icon")).toBe("missing");
    });

    it("resolves without error for a slug that does not exist", async () => {
        await expect(loadIcon("not-an-icon")).resolves.toBeUndefined();
        expect(peekIcon("not-an-icon")).toBeUndefined();
    });

    it("reports missing once the shard has settled without the slug", async () => {
        await loadIcon("hammer");
        expect(iconStatus("hammer-not-real")).toBe("missing");
    });

    it("is a no-op for an already-loaded slug", async () => {
        await loadIcon("key");
        await expect(loadIcon("key")).resolves.toBeUndefined();
    });

    it("preloadIcons warms several shards at once", async () => {
        await preloadIcons(["navigation", "omega"]);
        expect(peekIcon("navigation")).toBeTypeOf("object");
        expect(peekIcon("omega")).toBeTypeOf("object");
    });
});

describe("isIconName", () => {
    it("accepts a canonical slug and a deprecated alias", () => {
        expect(isIconName("circle-alert")).toBe(true);
        expect(isIconName("alert-circle")).toBe(true);
    });
    it("rejects a PascalCase component name and a typo", () => {
        expect(isIconName("CircleAlert")).toBe(false);
        expect(isIconName("circle-alertt")).toBe(false);
    });
});
