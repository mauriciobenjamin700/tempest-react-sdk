import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser smoke suite for the demo gallery in `examples/gallery`.
 *
 * The gallery renders every component of the SDK against the built `dist/`, so
 * driving it in Chromium is the only check that covers what jsdom cannot: paint,
 * layout, colour contrast and runtime console errors. `webServer` serves the
 * gallery's production build — run `make e2e` (or `npm run e2e`) which builds
 * the SDK and the gallery first.
 */
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "npm --prefix examples/gallery run preview -- --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
