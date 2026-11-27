import { describe, expect, it, vi } from "vitest";

vi.mock("onnxruntime-web", () => {
    throw new Error("Cannot find package 'onnxruntime-web'");
});

import { loadWhisper } from "./whisper";

describe("loadWhisper without the optional peer", () => {
    it("names the package to install", async () => {
        await expect(loadWhisper({ baseUrl: "/models/whisper-tiny" })).rejects.toThrow(
            /npm install onnxruntime-web/,
        );
    });
});
