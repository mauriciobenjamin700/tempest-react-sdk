import { afterEach, describe, expect, it, vi } from "vitest";
import { openWhatsApp, toWhatsAppNumber, whatsAppUrl } from "./whatsapp";

describe("toWhatsAppNumber", () => {
    it("puts the country code in front of an eleven-digit mobile", () => {
        expect(toWhatsAppNumber("11999998888")).toBe("5511999998888");
    });

    it("puts the country code in front of a ten-digit landline", () => {
        expect(toWhatsAppNumber("1133334444")).toBe("551133334444");
    });

    it("strips the mask a form field produces", () => {
        expect(toWhatsAppNumber("(11) 99999-8888")).toBe("5511999998888");
    });

    it("accepts a number already written in E.164", () => {
        expect(toWhatsAppNumber("+55 (11) 99999-8888")).toBe("5511999998888");
    });

    it("leaves a foreign number that already carries its country code untouched", () => {
        expect(toWhatsAppNumber("+351 912 345 678")).toBe("351912345678");
    });

    it("returns an empty string for a number too short to dial", () => {
        expect(toWhatsAppNumber("99999-8888")).toBe("");
    });

    it("returns an empty string past the fifteen digits E.164 allows", () => {
        expect(toWhatsAppNumber("1234567890123456")).toBe("");
    });

    it("returns an empty string for input with no digits at all", () => {
        expect(toWhatsAppNumber("fale comigo")).toBe("");
    });

    it("reads a trunk prefix as invalid instead of silently reinterpreting it", () => {
        expect(toWhatsAppNumber("011999998888")).toBe("");
    });
});

describe("whatsAppUrl", () => {
    it("builds the chat link", () => {
        expect(whatsAppUrl("(11) 99999-8888")).toBe("https://wa.me/5511999998888");
    });

    it("percent-encodes the pre-filled message, accents included", () => {
        expect(whatsAppUrl("11999998888", "Seu horário é às 14h")).toBe(
            "https://wa.me/5511999998888?text=Seu%20hor%C3%A1rio%20%C3%A9%20%C3%A0s%2014h",
        );
    });

    it("omits the query entirely when there is no message", () => {
        expect(whatsAppUrl("11999998888", "")).toBe("https://wa.me/5511999998888");
    });

    it("returns an empty string instead of a link to a number nobody owns", () => {
        expect(whatsAppUrl("99999-8888", "oi")).toBe("");
    });
});

describe("openWhatsApp", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("opens the chat in a new tab with noopener", () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);

        expect(openWhatsApp("11999998888", "oi")).toBe(true);
        expect(open).toHaveBeenCalledWith(
            "https://wa.me/5511999998888?text=oi",
            "_blank",
            "noopener,noreferrer",
        );
    });

    it("does not open anything when the number cannot be normalised", () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);

        expect(openWhatsApp("99999-8888")).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });

    it("returns false outside a browser instead of throwing", () => {
        vi.stubGlobal("window", undefined);

        expect(openWhatsApp("11999998888")).toBe(false);
    });
});
