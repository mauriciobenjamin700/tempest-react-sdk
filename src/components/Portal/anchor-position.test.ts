import { describe, expect, it } from "vitest";
import { computeAnchorPosition } from "./anchor-position";
import type { AnchorGeometry } from "./anchor-position";

const base: AnchorGeometry = {
    anchor: { top: 100, left: 200, width: 40, height: 20 },
    width: 100,
    height: 50,
    viewportWidth: 1000,
    viewportHeight: 800,
    side: "bottom",
    align: "start",
    offset: 4,
    margin: 8,
};

describe("computeAnchorPosition", () => {
    it("places the layer on the requested side with the offset", () => {
        expect(computeAnchorPosition(base)).toEqual({ top: 124, left: 200, side: "bottom" });
        expect(computeAnchorPosition({ ...base, side: "top" })).toEqual({
            top: 46,
            left: 200,
            side: "top",
        });
        expect(computeAnchorPosition({ ...base, side: "right", align: "center" })).toEqual({
            top: 85,
            left: 244,
            side: "right",
        });
        expect(computeAnchorPosition({ ...base, side: "left", align: "end" })).toEqual({
            top: 70,
            left: 96,
            side: "left",
        });
    });

    it("aligns along the anchor edge", () => {
        expect(computeAnchorPosition({ ...base, align: "end" }).left).toBe(140);
        expect(computeAnchorPosition({ ...base, align: "center" }).left).toBe(170);
    });

    it("flips to the opposite side when the requested one overflows and the other fits", () => {
        const nearBottom = { ...base, anchor: { ...base.anchor, top: 760 } };
        expect(computeAnchorPosition(nearBottom)).toEqual({ top: 706, left: 200, side: "top" });
        const nearTop = { ...base, side: "top" as const, anchor: { ...base.anchor, top: 10 } };
        expect(computeAnchorPosition(nearTop).side).toBe("bottom");
        const nearRight = {
            ...base,
            side: "right" as const,
            anchor: { ...base.anchor, left: 900 },
        };
        expect(computeAnchorPosition(nearRight).side).toBe("left");
    });

    it("keeps the requested side and clamps when neither side fits", () => {
        const tall = { ...base, height: 790 };
        const result = computeAnchorPosition(tall);
        expect(result.side).toBe("bottom");
        expect(result.top).toBe(8);
    });

    it("clamps the cross axis inside the viewport margin", () => {
        const atRightEdge = { ...base, anchor: { ...base.anchor, left: 960 } };
        expect(computeAnchorPosition(atRightEdge).left).toBe(1000 - 100 - 8);
        const atLeftEdge = { ...base, align: "end" as const, anchor: { ...base.anchor, left: 0 } };
        expect(computeAnchorPosition(atLeftEdge).left).toBe(8);
    });
});
