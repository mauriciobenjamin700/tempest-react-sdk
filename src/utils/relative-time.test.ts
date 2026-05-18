import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const NOW = new Date("2026-05-17T12:00:00Z").getTime();
const opts = { now: NOW };

describe("relativeTime — past", () => {
    it("treats a few seconds as 'agora há pouco'", () => {
        expect(relativeTime(new Date(NOW - 5_000), opts)).toBe("agora há pouco");
    });

    it("formats minutes ago", () => {
        expect(relativeTime(new Date(NOW - 5 * 60_000), opts)).toBe("5 min atrás");
    });

    it("formats 1 hour as 'hora'", () => {
        expect(relativeTime(new Date(NOW - 60 * 60_000), opts)).toBe("1 hora atrás");
    });

    it("formats yesterday", () => {
        expect(relativeTime(new Date(NOW - 24 * 60 * 60_000), opts)).toBe("ontem");
    });

    it("formats months", () => {
        expect(relativeTime(new Date(NOW - 60 * 24 * 60 * 60_000), opts)).toBe("2 meses atrás");
    });

    it("formats years", () => {
        expect(relativeTime(new Date(NOW - 2 * 365 * 24 * 60 * 60_000), opts)).toBe("2 anos atrás");
    });
});

describe("relativeTime — future", () => {
    it("formats minutes in the future", () => {
        expect(relativeTime(new Date(NOW + 10 * 60_000), opts)).toBe("em 10 min");
    });

    it("formats days in the future", () => {
        expect(relativeTime(new Date(NOW + 3 * 24 * 60 * 60_000), opts)).toBe("em 3 dias");
    });
});

describe("relativeTime — locale", () => {
    it("formats English minutes ago", () => {
        expect(relativeTime(new Date(NOW - 5 * 60_000), { ...opts, locale: "en" })).toBe("5m ago");
    });

    it("formats English yesterday", () => {
        expect(relativeTime(new Date(NOW - 24 * 60 * 60_000), { ...opts, locale: "en" })).toBe(
            "yesterday",
        );
    });
});

describe("relativeTime — input types", () => {
    it("accepts ISO strings", () => {
        expect(relativeTime("2026-05-17T11:55:00Z", opts)).toBe("5 min atrás");
    });

    it("accepts timestamps", () => {
        expect(relativeTime(NOW - 60_000, opts)).toBe("1 min atrás");
    });
});
