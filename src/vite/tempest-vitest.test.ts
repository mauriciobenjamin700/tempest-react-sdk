import { describe, expect, it } from "vitest";

import { tempestVitest } from "./tempest-vitest";

type ConfigHook = (userConfig: Record<string, unknown>) => unknown;

/**
 * Call the plugin's `config` hook the way Vite does.
 *
 * @param userConfig - The config the app declared.
 * @returns What the plugin contributes for Vite to merge.
 */
function contribute(userConfig: Record<string, unknown> = {}): unknown {
    return (tempestVitest().config as ConfigHook)(userConfig);
}

describe("tempestVitest", () => {
    it("inlines the SDK so Vitest transforms it instead of handing it to Node", () => {
        expect(contribute()).toEqual({
            test: { server: { deps: { inline: ["tempest-react-sdk"] } } },
        });
    });

    it("contributes the same entry next to a list the app already declares", () => {
        expect(contribute({ test: { server: { deps: { inline: ["other-lib"] } } } })).toEqual({
            test: { server: { deps: { inline: ["tempest-react-sdk"] } } },
        });
    });

    it("stays out of an inline-everything config, which Vite's merge would break", () => {
        expect(contribute({ test: { server: { deps: { inline: true } } } })).toBeUndefined();
    });
});
