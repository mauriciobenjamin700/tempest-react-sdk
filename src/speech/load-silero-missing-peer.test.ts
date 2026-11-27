import { describe, expect, it, vi } from "vitest";

vi.mock("onnxruntime-web", () => {
    throw new Error("Cannot find package 'onnxruntime-web'");
});

import { loadSileroVad } from "./vad";

describe("loadSileroVad without the optional peer", () => {
    it("names the package to install", async () => {
        await expect(loadSileroVad({ modelUrl: "/m.onnx" })).rejects.toThrow(
            /npm install onnxruntime-web/,
        );
    });
});
