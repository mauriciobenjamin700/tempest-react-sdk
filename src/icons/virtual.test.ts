import { describe, expect, it } from "vitest";

import { staticIcons } from "./virtual";

describe("staticIcons stub", () => {
    it("resolves to an empty registry when no build plugin replaced it", () => {
        expect(staticIcons).toEqual({});
    });
});
