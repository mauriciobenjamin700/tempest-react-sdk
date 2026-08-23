/**
 * The ONNX route without the optional peer installed.
 *
 * `onnxruntime-web` is a `peerDependenciesMeta.optional` entry, so an app that
 * only ever loads compact models never installs it. The failure that reaches
 * such an app is a bare module-resolution error from a dynamic import, which
 * says nothing about what to do; this checks the SDK replaces it with the
 * instruction. Found by installing the published package into an empty project,
 * which is the only place the difference shows — so it is worth a test that does
 * not need an empty project.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("onnxruntime-web", () => {
    throw new Error("Cannot find module 'onnxruntime-web'");
});

const { TabularPredictor } = await import("./predictor");
const { ModelLoadError } = await import("./exceptions");

describe("tabular · the ONNX peer that is not there", () => {
    it("names the package to install instead of leaking the resolution error", async () => {
        const attempt = TabularPredictor.create(new Uint8Array([1, 2, 3]));

        await expect(attempt).rejects.toBeInstanceOf(ModelLoadError);
        await expect(attempt).rejects.toThrow(/npm install onnxruntime-web/);
        await expect(attempt).rejects.toThrow(/CompactPredictor/);
    });
});
