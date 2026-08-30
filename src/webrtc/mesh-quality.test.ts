import { describe, expect, it } from "vitest";

import { resolveDegradation, scaleForRoom } from "./mesh-quality";
import type { MeshQuality } from "./mesh-types";

describe("scaleForRoom", () => {
    const asked: MeshQuality = {
        video: { cam: 1200, screen: 3000 },
        uplinkBudgetKbps: 6000,
    };

    it("leaves a one-to-one call alone, which is what the largest sizes exist for", () => {
        expect(scaleForRoom(asked, 1)).toBe(asked);
        expect(scaleForRoom(asked, 0)).toBe(asked);
    });

    it("leaves the caps alone while they fit the share", () => {
        const roomy: MeshQuality = { ...asked, uplinkBudgetKbps: 12000 };

        expect(scaleForRoom(roomy, 2)).toBe(roomy);
    });

    it("divides proportionally once they do not", () => {
        const scaled = scaleForRoom(asked, 4).video ?? {};

        expect(scaled.cam).toBe(429);
        expect(scaled.screen).toBe(1071);
        expect((scaled.cam ?? 0) + (scaled.screen ?? 0)).toBeLessThanOrEqual(6000 / 4);
    });

    it("lifts to the floor only what fell below it, leaving the rest divided", () => {
        const scaled = scaleForRoom({ ...asked, minVideoKbps: 500 }, 8).video ?? {};

        expect(scaled.cam).toBe(500);
        expect(scaled.screen).toBe(536);
    });

    it("floors every slot once the division is small enough to reach them all", () => {
        const scaled =
            scaleForRoom({ ...asked, minVideoKbps: 500, uplinkBudgetKbps: 600 }, 8).video ?? {};

        expect(scaled.cam).toBe(500);
        expect(scaled.screen).toBe(500);
    });

    it("never rewrites what was asked for, so an emptying room climbs back", () => {
        scaleForRoom(asked, 6);

        expect(asked.video).toEqual({ cam: 1200, screen: 3000 });
    });

    it("leaves an uncapped slot uncapped", () => {
        const scaled = scaleForRoom(
            { video: { cam: 4000, screen: null }, uplinkBudgetKbps: 1000 },
            4,
        );

        expect(scaled.video?.screen).toBeNull();
        expect(scaled.video?.cam).toBeGreaterThan(0);
    });

    it("has nothing to divide when no video slot is capped", () => {
        const audioOnly: MeshQuality = { audio: { mic: 32000 } };

        expect(scaleForRoom(audioOnly, 5)).toBe(audioOnly);
    });
});

describe("resolveDegradation", () => {
    it("passes through anything that is not maintain-framerate", () => {
        expect(resolveDegradation({ degradationPreference: "maintain-resolution" }, {})).toBe(
            "maintain-resolution",
        );
        expect(resolveDegradation({}, {})).toBeUndefined();
    });

    it("honours maintain-framerate while the budget is worth holding frames for", () => {
        const asked: MeshQuality = { degradationPreference: "maintain-framerate" };
        const effective: MeshQuality = { video: { screen: 2000 } };

        expect(resolveDegradation(asked, effective)).toBe("maintain-framerate");
    });

    it("overrides it once the room's division took the budget below the floor", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };
        const effective: MeshQuality = { video: { screen: 400, cam: 300 } };

        expect(resolveDegradation(asked, effective)).toBe("maintain-resolution");
    });

    it("reads the largest slot, not the sum, because they encode separately", () => {
        const asked: MeshQuality = {
            degradationPreference: "maintain-framerate",
            fluidFloorKbps: 900,
        };

        expect(resolveDegradation(asked, { video: { screen: 1000, cam: 300 } })).toBe(
            "maintain-framerate",
        );
    });

    it("keeps the preference when nothing is capped, since nothing says otherwise", () => {
        const asked: MeshQuality = { degradationPreference: "maintain-framerate" };

        expect(resolveDegradation(asked, { video: { screen: null } })).toBe("maintain-framerate");
        expect(resolveDegradation(asked, {})).toBe("maintain-framerate");
    });
});
