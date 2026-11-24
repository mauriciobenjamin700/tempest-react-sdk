import { expect, test } from "@playwright/test";

/**
 * Browser verification for #808: `TrajectoryMap` with `tileUrl` and `markers`
 * (even with `points={[]}`) renders self-hosted tiles directly inside the SVG
 * with zero Leaflet dependency, keeps markers inside the viewport and fires
 * `onMarkerClick`.
 */
for (const width of [390, 1280]) {
    test.describe(`TrajectoryMap tiles at ${width}px`, () => {
        test.use({ viewport: { width, height: 900 } });

        test("renders tiles, attribution and clickable marker without Leaflet", async ({
            page,
        }) => {
            const consoleErrors: string[] = [];
            page.on("console", (msg) => {
                if (msg.type() !== "error") return;
                const text = msg.text();
                if (
                    text.includes("WebSocket connection to") ||
                    text.includes("net::ERR_") ||
                    text.includes("Failed to load resource")
                ) {
                    return;
                }
                consoleErrors.push(text);
            });
            page.on("pageerror", (err) => consoleErrors.push(err.message));

            await page.goto("/");
            const demo = page.locator("#ex-trajectory-map-tiles .example-demo");
            await demo.scrollIntoViewIfNeeded();

            await expect(demo).not.toContainText("Leaflet não encontrado");
            await expect(demo.getByText("© Mapa local")).toBeVisible();

            const metrics = await demo.evaluate((root) => {
                const map = root.querySelector("[role='region']") as HTMLElement | null;
                const images = [...root.querySelectorAll("svg image")];
                const marker = root.querySelector("circle[data-marker-id='store-1']");
                const mapRect = map?.getBoundingClientRect();
                const markerRect = marker?.getBoundingClientRect();
                const visibleTiles = images.filter(
                    (img) => img.getBoundingClientRect().width > 0,
                ).length;
                return {
                    hasMap: Boolean(mapRect),
                    tileCount: images.length,
                    visibleTiles,
                    markerInside:
                        Boolean(mapRect && markerRect) &&
                        markerRect!.left >= mapRect!.left &&
                        markerRect!.right <= mapRect!.right &&
                        markerRect!.top >= mapRect!.top &&
                        markerRect!.bottom <= mapRect!.bottom,
                };
            });

            expect(metrics.hasMap).toBe(true);
            expect(metrics.tileCount).toBeGreaterThan(0);
            expect(metrics.visibleTiles).toBeGreaterThan(0);
            expect(metrics.markerInside).toBe(true);

            await demo.getByRole("button", { name: "Loja Centro" }).click();
            await expect(demo.getByText("Marcador selecionado: Loja Centro")).toBeVisible();
            expect(consoleErrors).toEqual([]);
        });
    });
}
