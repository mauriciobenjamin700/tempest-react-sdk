/**
 * Type-level guard for the bound of `lazyWithRetry` and of `route.lazy`.
 *
 * The suite is type-checked (`tsc -b` covers `src/**`), so a file that would
 * not compile *is* the assertion. Every declaration below was rejected while
 * the bound read `ComponentType<unknown>`: props sit in a parameter position,
 * so that bound admitted only components declaring no props at all — the whole
 * reason a route tree of typed pages could not migrate to this helper.
 *
 * The `@ts-expect-error` block is the other half, and matters more over time:
 * relaxing the *bound* must not relax *inference*. If the return type were ever
 * widened too, those three directives would stop firing, TypeScript would
 * report TS2578 (unused directive) and this file would go red — which is the
 * point. A directive that starts reporting TS2578 is a regression to
 * investigate, never a line to delete.
 */
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import { lazyWithRetry } from "@/auth/lazy-with-retry";
import type { PreloadableLazy } from "@/auth/lazy-with-retry";
import type { TempestRouteObject } from "@/router/types";

interface EditorProps {
    mode: "edit" | "view";
}

/** Page with a required prop — the shape that could not compile before. */
function Editor({ mode }: EditorProps) {
    return <p>editor:{mode}</p>;
}

/** Page whose only prop is optional — rejected by the old bound as well. */
function Banner({ label }: { label?: string }) {
    return <p>banner:{label ?? "none"}</p>;
}

/** Page with no props at all — the only shape the old bound accepted. */
function Blank() {
    return <p>blank</p>;
}

const LazyEditor = lazyWithRetry(() => Promise.resolve({ default: Editor }));
const LazyBanner = lazyWithRetry(() => Promise.resolve({ default: Banner }));
const LazyBlank = lazyWithRetry(() => Promise.resolve({ default: Blank }));

/**
 * Pins the exported alias itself. `PreloadableLazy` is public and carries the
 * same bound as the function, so a consumer naming the type hits the defect
 * without ever calling `lazyWithRetry`.
 */
const explicitAlias: PreloadableLazy<typeof Editor> = LazyEditor;

/**
 * The router's own field, which repeats the bound independently: `AppRouter`
 * hands `route.lazy` straight to `lazyWithRetry`, so a route tree of typed
 * pages failed here even with the auth module fixed.
 */
const routes: TempestRouteObject[] = [
    { path: "edit", lazy: () => Promise.resolve({ default: Editor }) },
    { path: "banner", lazy: () => Promise.resolve({ default: Banner }) },
    { index: true, lazy: () => Promise.resolve({ default: Blank }) },
];

describe("lazyWithRetry — component typing", () => {
    it("accepts required, optional and absent props, and renders each", async () => {
        render(
            <Suspense fallback={<p>loading</p>}>
                <LazyEditor mode="edit" />
                <LazyBanner />
                <LazyBlank />
            </Suspense>,
        );

        expect(await screen.findByText("editor:edit")).toBeInTheDocument();
        expect(screen.getByText("banner:none")).toBeInTheDocument();
        expect(screen.getByText("blank")).toBeInTheDocument();
        expect(explicitAlias).toBe(LazyEditor);
        expect(routes).toHaveLength(3);
    });

    it("still rejects wrong props", () => {
        const missing = (
            // @ts-expect-error `mode` is required and absent.
            <LazyEditor />
        );
        const outsideUnion = (
            // @ts-expect-error "bogus" is not a member of the `mode` union.
            <LazyEditor mode="bogus" />
        );
        const unknownProp = (
            // @ts-expect-error `nope` is not a prop of Editor.
            <LazyEditor mode="view" nope />
        );

        expect([missing, outsideUnion, unknownProp]).toHaveLength(3);
    });

    it("keeps preload() typed as the module", async () => {
        const mod = await LazyEditor.preload();
        const Direct = mod.default;

        render(<Direct mode="view" />);

        expect(screen.getByText("editor:view")).toBeInTheDocument();
    });
});
