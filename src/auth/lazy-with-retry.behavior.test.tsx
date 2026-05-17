import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyWithRetry } from "./lazy-with-retry";

describe("lazyWithRetry behavior", () => {
    it("retries the factory and eventually renders the component", async () => {
        let attempts = 0;
        const Sample: ComponentType<unknown> = () => <span>loaded</span>;
        const factory = vi.fn(async () => {
            attempts += 1;
            if (attempts < 2) throw new Error("chunk error");
            return { default: Sample };
        });
        const Lazy = lazyWithRetry(factory, {
            retries: 3,
            initialDelay: 1,
            reloadOnFinalFailure: false,
        });
        render(
            <Suspense fallback={<span>loading</span>}>
                <Lazy />
            </Suspense>,
        );
        await screen.findByText("loaded");
        expect(attempts).toBe(2);
    });
});
