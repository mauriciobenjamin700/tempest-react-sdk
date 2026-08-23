import { describe, expect, it } from "vitest";
import {
    formatCPF,
    formatCurrency,
    formatDate,
    formatDateForInput,
    formatDateTime,
    formatPercent,
    formatPhone,
} from "./format";

describe("formatCurrency", () => {
    it("formats BRL value", () => {
        expect(formatCurrency(1234.5)).toContain("R$");
        expect(formatCurrency(1234.5)).toContain("1.234,5");
    });
});

describe("formatDate", () => {
    it("formats ISO string as PT-BR", () => {
        expect(formatDate("2026-05-16T12:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it("returns empty string for invalid date", () => {
        expect(formatDate("not-a-date")).toBe("");
    });

    it("accepts Date instances", () => {
        expect(formatDate(new Date("2026-05-16"))).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
});

describe("formatDateTime", () => {
    it("formats date + time", () => {
        const out = formatDateTime(new Date("2026-05-16T12:30:00Z"));
        expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(out).toMatch(/\d{2}:\d{2}/);
    });

    it("returns empty string for invalid", () => {
        expect(formatDateTime("nope")).toBe("");
    });
});

describe("formatPhone", () => {
    it("formats 11-digit mobile", () => {
        expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    });

    it("formats 10-digit landline", () => {
        expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    });

    it("strips non-digits before masking", () => {
        expect(formatPhone("(11) 9 8765-4321")).toBe("(11) 98765-4321");
    });

    it("clamps at 11 digits", () => {
        expect(formatPhone("119876543219999")).toBe("(11) 98765-4321");
    });
});

describe("formatCPF", () => {
    it("formats CPF", () => {
        expect(formatCPF("12345678900")).toBe("123.456.789-00");
    });

    it("handles partial input", () => {
        expect(formatCPF("123")).toBe("123");
    });
});

describe("formatPercent", () => {
    it("formats fraction as PT-BR percent", () => {
        expect(formatPercent(0.125)).toBe("12,5%");
    });

    it("formats zero", () => {
        expect(formatPercent(0)).toBe("0,0%");
    });
});

describe("formatDateForInput", () => {
    it("formats a Date as the yyyy-MM-dd an input accepts", () => {
        expect(formatDateForInput(new Date(2026, 4, 16))).toBe("2026-05-16");
    });

    it("pads single-digit months and days", () => {
        expect(formatDateForInput(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    it("keeps the local day for a time that UTC would push to the next one", () => {
        expect(formatDateForInput(new Date(2026, 5, 30, 23, 30))).toBe("2026-06-30");
    });

    it("returns a plain yyyy-MM-dd string untouched, which UTC parsing would shift back a day", () => {
        expect(formatDateForInput("2026-05-16")).toBe("2026-05-16");
    });

    it("reads a full ISO timestamp in local time", () => {
        expect(formatDateForInput(new Date(2026, 4, 16, 12).toISOString())).toBe("2026-05-16");
    });

    it("returns an empty string for an invalid date, which the input reads as no value", () => {
        expect(formatDateForInput("not-a-date")).toBe("");
    });
});

describe("formatPhone — mobile mode", () => {
    it("groups 5+4 from the first subscriber digit, so the hyphen never moves", () => {
        // The default reads <=10 digits as a landline and hyphenates after the
        // fourth subscriber digit, which makes the separator jump backwards
        // while the user is still typing. Mobile mode keeps it in place.
        expect(formatPhone("1191234")).toBe("(11) 9123-4");
        expect(formatPhone("1191234", { mobile: true })).toBe("(11) 91234");
    });

    it("inserts the mandatory leading 9 when it is missing", () => {
        expect(formatPhone("1112345678", { mobile: true })).toBe("(11) 91234-5678");
    });

    it("does not duplicate a 9 that is already there", () => {
        expect(formatPhone("11912345678", { mobile: true })).toBe("(11) 91234-5678");
    });

    it("agrees with the default once all 11 digits are in", () => {
        expect(formatPhone("11987654321", { mobile: true })).toBe(formatPhone("11987654321"));
    });

    it("masks progressively without a hyphen until the sixth subscriber digit", () => {
        const typed = ["1", "11", "119", "1191", "11912", "119123", "1191234", "11912345"];
        expect(typed.map((v) => formatPhone(v, { mobile: true }))).toEqual([
            "1",
            "11",
            "(11) 9",
            "(11) 91",
            "(11) 912",
            "(11) 9123",
            "(11) 91234",
            "(11) 91234-5",
        ]);
    });

    it("accepts an already-masked value and stays stable", () => {
        expect(formatPhone("(11) 91234-5678", { mobile: true })).toBe("(11) 91234-5678");
    });

    it("ignores digits past the eleventh", () => {
        expect(formatPhone("119123456789999", { mobile: true })).toBe("(11) 91234-5678");
    });

    it("leaves the default behaviour untouched", () => {
        expect(formatPhone("1132654321")).toBe("(11) 3265-4321");
        expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    });
});
