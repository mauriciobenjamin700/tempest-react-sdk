/**
 * `src/styles/scoped.css` is generated from `reset.css` by
 * `scripts/gen-scoped-reset.mjs`. Nothing ran its `--check` before #813, and
 * the generator and the committed file had drifted apart (indentation inside
 * `@layer`): every build rewrote 103 lines and dirtied the tree, which stopped
 * `make release-tag` with "working tree sujo".
 *
 * @vitest-environment node
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("scoped reset", () => {
    it("matches what the generator writes, byte for byte", () => {
        const run = spawnSync(process.execPath, ["scripts/gen-scoped-reset.mjs", "--check"], {
            cwd: ROOT,
            encoding: "utf8",
        });
        expect(`${run.stdout}${run.stderr}`).not.toContain("stale");
        expect(run.status).toBe(0);
    });
});
