import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { ShareButton } from "./ShareButton";

const URL_42 = "https://app.example/c/42";

beforeEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
});

afterEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
    vi.unstubAllGlobals();
});

describe("ShareButton", () => {
    it("is a wa.me link that says WhatsApp where there is no Web Share API", () => {
        render(<ShareButton text="Carona sexta" url={URL_42} />);
        const link = screen.getByRole("link", { name: "Compartilhar no WhatsApp" });
        expect(link).toHaveAttribute(
            "href",
            `https://wa.me/?text=${encodeURIComponent(`Carona sexta\n${URL_42}`)}`,
        );
        expect(link).toHaveAttribute("target", "_blank");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("opens the share sheet with the image where Web Share and files are supported", async () => {
        const fetchStub = vi.fn(
            async () =>
                new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }),
        );
        vi.stubGlobal("fetch", fetchStub);
        const share = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { share, canShare: vi.fn(() => true) });
        const onShare = vi.fn();
        render(
            <ShareButton
                title="Carona"
                text="Sexta"
                url={URL_42}
                imageUrl="https://app.example/c/42/og.png"
                onShare={onShare}
            />,
        );
        const button = screen.getByRole("button", { name: "Compartilhar" });
        fireEvent.focus(button);
        expect(fetchStub).toHaveBeenCalledTimes(1);
        await act(async () => {
            fireEvent.click(button);
        });
        const payload = share.mock.calls[0]?.[0] as ShareData;
        expect(payload.text).toBe(`Sexta\n${URL_42}`);
        expect(payload.files?.[0]?.name).toBe("og.png");
        expect(onShare).toHaveBeenCalledWith("shared");
    });

    it("does not prefetch when there is no image", () => {
        const fetchStub = vi.fn();
        vi.stubGlobal("fetch", fetchStub);
        Object.assign(navigator, { share: vi.fn(), canShare: vi.fn(() => true) });
        render(<ShareButton url={URL_42} />);
        fireEvent.pointerDown(screen.getByRole("button", { name: "Compartilhar" }));
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it("names an icon-only button after its label on both paths", () => {
        const { unmount } = render(<ShareButton iconOnly url={URL_42} />);
        expect(screen.getByRole("link", { name: "Compartilhar no WhatsApp" })).toBeInTheDocument();
        unmount();
        Object.assign(navigator, { share: vi.fn(), canShare: vi.fn(() => false) });
        render(<ShareButton iconOnly url={URL_42} labels={{ native: "Divulgar carona" }} />);
        expect(screen.getByRole("button", { name: "Divulgar carona" })).toBeInTheDocument();
    });

    it("speaks English under an English I18nProvider", () => {
        render(
            <I18nProvider locale="en" messages={{ en: {} }} storageKey={null}>
                <ShareButton url={URL_42} />
            </I18nProvider>,
        );
        expect(screen.getByRole("link", { name: "Share on WhatsApp" })).toBeInTheDocument();
    });

    it("has no axe violations on either path", async () => {
        const first = render(<ShareButton iconOnly url={URL_42} />);
        let violations = await findA11yViolations(first.container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
        first.unmount();
        Object.assign(navigator, { share: vi.fn(), canShare: vi.fn(() => false) });
        const second = render(<ShareButton url={URL_42} />);
        violations = await findA11yViolations(second.container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
    });
});
