import { describe, expect, it, vi } from "vitest";

vi.mock("onnxruntime-web", () => {
    throw new Error("Cannot find package 'onnxruntime-web'");
});

import { loadAudioModel } from "./audio-model";

describe("loadAudioModel without the optional peer", () => {
    it("names the package to install", async () => {
        await expect(loadAudioModel({ modelUrl: "/m.onnx", feature: "waveform" })).rejects.toThrow(
            /npm install onnxruntime-web/,
        );
    });
});
