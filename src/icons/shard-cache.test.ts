import { describe, expect, it } from "vitest";

import { iconAliases } from "./generated/aliases";
import { shardLoaders } from "./generated/loaders";
import { iconNames } from "./generated/icon-names";
import { isIconName } from "./is-icon-name";
import { iconStatus, loadIcon, peekIcon, preloadIcons, resolveIconAlias } from "./shard-cache";

describe("generated tables", () => {
    it("covers every lucide slug, canonical plus alias", () => {
        expect(iconNames.length).toBe(2024);
        expect(Object.keys(iconAliases).length).toBe(257);
    });
    it("has one shard loader per initial letter, and lucide has no y icon", () => {
        const letters = Object.keys(shardLoaders).sort().join("");
        expect(letters).toBe("abcdefghijklmnopqrstuvwxz");
    });
    it("maps every alias to a canonical slug that is itself not an alias", () => {
        for (const [alias, canonical] of Object.entries(iconAliases)) {
            expect(iconNames).toContain(canonical);
            expect(iconAliases[canonical]).toBeUndefined();
            expect(alias).not.toBe(canonical);
        }
    });
    it("has a loader for the initial letter of every slug", () => {
        for (const slug of iconNames) {
            expect(shardLoaders[resolveIconAlias(slug)[0]]).toBeTypeOf("function");
        }
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

    it("brings in every sibling of a loaded shard", async () => {
        await loadIcon("quote");
        expect(peekIcon("qr-code")).toBeTypeOf("object");
    });

    it("collapses concurrent loads of one shard into a single import", async () => {
        const first = loadIcon("gauge");
        const second = loadIcon("gift");
        expect(second).toBe(first);
        await first;
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
