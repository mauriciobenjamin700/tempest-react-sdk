/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { "@": resolve(__dirname, "src") },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./test/setup.ts"],
        // Explicit include so `e2e/` stays out: it holds Playwright specs (real
        // browser, own runner) that Vitest would collect and fail on for the
        // missing Playwright fixtures. `bin/` carries the OpenAPI codegen tests.
        include: ["src/**/*.test.{ts,tsx}", "bin/**/*.test.mjs"],
        css: { modules: { classNameStrategy: "non-scoped" } },
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts", "src/types.d.ts"],
        },
    },
});
