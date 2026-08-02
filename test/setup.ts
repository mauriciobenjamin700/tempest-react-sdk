import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import { clearAnnouncer } from "../src/hooks/use-announce";

/**
 * `cleanup` only unmounts what Testing Library rendered. The shared announcer
 * regions are appended straight to `<body>` and outlive it, so without this a
 * message announced by one test is still in the DOM for the next one.
 */
afterEach(() => {
    cleanup();
    clearAnnouncer();
});

if (typeof window !== "undefined" && !("matchMedia" in window)) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    });
}
