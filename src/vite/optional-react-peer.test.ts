import { describe, expect, it, vi } from "vitest";

/**
 * `@vitejs/plugin-react` is an optional peer, so nothing but `createViteConfig`
 * may need it.
 *
 * Every helper of `tempest-react-sdk/vite` ships through one barrel, and
 * `create-vite-config` imported the React plugin at the top of the module. A
 * project without it — a library, a SWC app on `@vitejs/plugin-react-swc` —
 * could not even load a config importing `tempestVitest` or `tempestCsp`:
 * `ERR_MODULE_NOT_FOUND: Cannot find package '@vitejs/plugin-react'` (#401).
 *
 * The mock below stands in for "not installed": evaluating the module throws.
 * A static import anywhere in the barrel's graph fails the import itself.
 */
vi.mock("@vitejs/plugin-react", () => {
    throw new Error("Cannot find package '@vitejs/plugin-react'");
});

describe("tempest-react-sdk/vite without @vitejs/plugin-react", () => {
    it("imports the barrel", async () => {
        const vite = await import("./index");

        expect(typeof vite.tempestVitest).toBe("function");
        expect(typeof vite.tempestCsp).toBe("function");
    });

    it("builds the Vitest plugin", async () => {
        const { tempestVitest } = await import("./index");

        expect(tempestVitest().name).toBe("tempest-vitest");
    });
});
