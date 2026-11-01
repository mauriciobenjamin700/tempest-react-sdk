/**
 * A tampered `.tmc` must fail at load, never hang or answer `NaN` at predict.
 *
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CompactPredictor } from "./compact";
import { CompactFormatError } from "./exceptions";

/** A fixture's bytes, as a fresh copy the test may edit. */
function fixture(name: string): Uint8Array {
    return new Uint8Array(
        readFileSync(fileURLToPath(new URL(`./__fixtures__/compact/${name}`, import.meta.url))),
    );
}

/**
 * Rewrite one int32 of a named section in place.
 *
 * @param bytes The whole file.
 * @param section Section name from the header.
 * @param index Element index inside that section.
 * @param value The new value.
 * @returns The same bytes, edited.
 */
function patch(bytes: Uint8Array, section: string, index: number, value: number): Uint8Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as {
        sections: { name: string; length: number }[];
    };
    let cursor = 8 + headerLength;
    for (const entry of header.sections) {
        if (entry.name === section) {
            view.setInt32(cursor + index * 4, value, true);
            return bytes;
        }
        cursor += entry.length * 4;
    }
    throw new Error(`no section ${section}`);
}

describe("CompactPredictor — malformed trees fail at load", () => {
    it("still loads and predicts every well-formed tree fixture", async () => {
        for (const name of ["tree.tmc", "forest.tmc", "iris_forest.tmc", "forest_regressor.tmc"]) {
            await expect(CompactPredictor.create(fixture(name))).resolves.toBeInstanceOf(
                CompactPredictor,
            );
        }
    });

    it("rejects a child pointing back at its own node, which would loop forever", async () => {
        const bytes = patch(fixture("tree.tmc"), "node_left", 0, 0);
        await expect(CompactPredictor.create(bytes)).rejects.toThrow(/back up it/);
    });

    it("rejects a child past the end of its tree", async () => {
        const bytes = patch(fixture("tree.tmc"), "node_right", 0, 1_000_000);
        await expect(CompactPredictor.create(bytes)).rejects.toBeInstanceOf(CompactFormatError);
    });

    it("rejects a split on a feature the model does not have", async () => {
        const bytes = patch(fixture("tree.tmc"), "node_feature", 0, 999);
        await expect(CompactPredictor.create(bytes)).rejects.toThrow(/splits on feature 999/);
    });

    it("rejects a leaf slot past the leaf values", async () => {
        const original = fixture("tree.tmc");
        const view = new DataView(original.buffer);
        const headerLength = view.getUint32(4, true);
        const header = JSON.parse(
            new TextDecoder().decode(original.subarray(8, 8 + headerLength)),
        ) as { sections: { name: string; length: number }[] };
        const nodes = header.sections.find((entry) => entry.name === "node_feature")?.length ?? 0;
        const last = nodes - 1;
        const bytes = patch(original, "node_feature", last, -1_000_000);
        await expect(CompactPredictor.create(bytes)).rejects.toThrow(/reads past the leaf values/);
    });

    it("rejects offsets that do not cover the node arrays", async () => {
        const bytes = patch(fixture("tree.tmc"), "tree_offset", 1, 5);
        await expect(CompactPredictor.create(bytes)).rejects.toThrow(
            /does not end at the last node/,
        );
    });

    it("rejects an empty tree", async () => {
        const bytes = patch(fixture("forest.tmc"), "tree_offset", 1, 0);
        await expect(CompactPredictor.create(bytes)).rejects.toThrow(/tree 0 has no nodes/);
    });
});
