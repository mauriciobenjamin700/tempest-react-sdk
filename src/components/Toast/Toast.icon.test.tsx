import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { ToastProvider, useToast } from "./ToastProvider";
import type { ToastApi, ToastOptions } from "./ToastProvider";

/**
 * Renders a provider and hands the toast API back to the test.
 *
 * @param children - Optional extra tree.
 * @returns The captured API and the render result.
 */
function setup(children?: ReactNode): { api: () => ToastApi; baseElement: HTMLElement } {
    let captured: ToastApi | null = null;
    function Capture(): null {
        captured = useToast();
        return null;
    }
    const { baseElement } = render(
        <ToastProvider defaultDuration={0}>
            <Capture />
            {children}
        </ToastProvider>,
    );
    return {
        api: () => {
            if (!captured) throw new Error("toast api not captured");
            return captured;
        },
        baseElement,
    };
}

/**
 * Shows one toast and returns its root element.
 *
 * @param options - The toast options.
 * @returns The toast element (parent of the content column).
 */
function showToast(options: ToastOptions): { toast: HTMLElement; baseElement: HTMLElement } {
    const { api, baseElement } = setup();
    act(() => {
        api().show(options);
    });
    const live = baseElement.querySelector("[aria-live]");
    const toast = live?.firstElementChild;
    if (!(toast instanceof HTMLElement)) throw new Error("toast not rendered");
    return { toast, baseElement };
}

const BADGE = <img src="/assets/invict.svg" alt="" data-testid="badge" />;

describe("Toast — icon slot", () => {
    it("renders the icon in a leading column before the text", () => {
        const { toast } = showToast({ icon: BADGE, title: "Título Invicto desbloqueado!" });
        const columns = Array.from(toast.children);
        expect(columns).toHaveLength(3);
        expect(columns[0]?.className).toContain("leading");
        expect(columns[0]?.contains(screen.getByTestId("badge"))).toBe(true);
        expect(columns[1]?.className).toContain("content");
        expect(columns[1]?.textContent).toBe("Título Invicto desbloqueado!");
        expect(columns[2]?.tagName).toBe("BUTTON");
        expect(toast.className).toContain("withIcon");
    });

    it("keeps the two-column layout when no icon is given", () => {
        const { toast } = showToast({ title: "Salvo" });
        expect(toast.children).toHaveLength(2);
        expect(toast.querySelector('[class*="leading"]')).toBeNull();
        expect(toast.className).not.toContain("withIcon");
    });

    it.each([null, false, true, ""])("treats icon=%s as no icon", (icon) => {
        const { toast } = showToast({ icon, title: "Salvo" });
        expect(toast.children).toHaveLength(2);
    });

    it("hides an unlabelled icon from assistive technology", () => {
        const { toast } = showToast({ icon: BADGE, title: "Conquista" });
        const leading = toast.firstElementChild;
        expect(leading?.getAttribute("aria-hidden")).toBe("true");
        expect(leading?.hasAttribute("role")).toBe(false);
    });

    it("exposes a labelled icon as an image announced with the toast", () => {
        const { toast } = showToast({
            icon: BADGE,
            iconLabel: "Medalha de ouro",
            title: "Conquista",
        });
        const leading = toast.firstElementChild;
        expect(leading?.hasAttribute("aria-hidden")).toBe(false);
        expect(screen.getByRole("img", { name: "Medalha de ouro" })).toBe(leading);
    });

    it("keeps the toast inside the polite live region", () => {
        const { toast } = showToast({ icon: BADGE, title: "Conquista" });
        const live = toast.parentElement;
        expect(live?.getAttribute("aria-live")).toBe("polite");
        expect(live?.getAttribute("aria-atomic")).toBe("false");
        expect(toast.hasAttribute("role")).toBe(false);
    });

    it("aligns text to the start by default", () => {
        expect(showToast({ title: "a" }).toast.className).not.toContain("alignCenter");
    });

    it("centres the text when align is center", () => {
        expect(showToast({ title: "b", align: "center" }).toast.className).toContain("alignCenter");
    });

    it("leaves variant and duration untouched when an icon is added", async () => {
        const { api, baseElement } = setup();
        act(() => {
            api().show({ icon: BADGE, title: "Conquista", variant: "success", duration: 30 });
        });
        const toast = baseElement.querySelector("[aria-live]")?.firstElementChild;
        expect(toast?.className).toContain("success");
        expect(screen.getByText("Conquista")).toBeInTheDocument();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
        });
        expect(screen.queryByText("Conquista")).not.toBeInTheDocument();
    });

    it("defaults the variant to info when only an icon and title are given", () => {
        const { toast } = showToast({ icon: BADGE, title: "Conquista" });
        expect(toast.className).toContain("info");
    });

    it("forwards icon options through the variant shortcuts", () => {
        const { api, baseElement } = setup();
        act(() => {
            api().success("Salvo", { icon: BADGE, iconLabel: "ok", align: "center" });
        });
        const toast = baseElement.querySelector("[aria-live]")?.firstElementChild;
        expect(toast?.className).toContain("success");
        expect(toast?.className).toContain("alignCenter");
        expect(screen.getByRole("img", { name: "ok" })).toBeInTheDocument();
    });

    it.each([
        ["decorative icon", { icon: BADGE, title: "Conquista", description: "Você venceu 10" }],
        ["labelled icon", { icon: <span>🏆</span>, iconLabel: "Troféu", title: "Conquista" }],
        ["centred text", { icon: BADGE, title: "Conquista", align: "center" as const }],
    ])("has no axe violations with a %s", async (_name, options) => {
        const { baseElement } = showToast(options);
        const violations = await findA11yViolations(baseElement);
        expect(formatA11yViolations(violations)).toBe("");
    });
});
