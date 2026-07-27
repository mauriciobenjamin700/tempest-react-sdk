import { describe, expect, it } from "vitest";

import { dayLabel, groupMessages, timeLabel, typingLabel, type ChatMessage } from "./chat-groups";

/** Noon on 2026-03-10, local time — a stable anchor for day maths. */
const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A message with only what the test cares about spelled out. */
function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage {
    return {
        body: "hi",
        authorId: "ana",
        sentAt: NOON,
        ...overrides,
    };
}

describe("groupMessages", () => {
    it("returns nothing for an empty thread", () => {
        expect(groupMessages({ messages: [] })).toEqual([]);
    });

    it("opens with a day heading", () => {
        const [first] = groupMessages({ messages: [message({ id: "1" })] });
        expect(first.kind).toBe("day");
    });

    it("keeps consecutive messages from one author in a single run", () => {
        const sections = groupMessages({
            messages: [
                message({ id: "1" }),
                message({ id: "2", sentAt: NOON + MINUTE }),
                message({ id: "3", sentAt: NOON + 2 * MINUTE }),
            ],
        });
        const runs = sections.filter((s) => s.kind === "run");
        expect(runs).toHaveLength(1);
        expect(runs[0].kind === "run" && runs[0].messages.map((m) => m.id)).toEqual([
            "1",
            "2",
            "3",
        ]);
    });

    it("breaks the run when the author changes", () => {
        const sections = groupMessages({
            messages: [
                message({ id: "1" }),
                message({ id: "2", authorId: "bruno", sentAt: NOON + MINUTE }),
                message({ id: "3", sentAt: NOON + 2 * MINUTE }),
            ],
        });
        expect(sections.filter((s) => s.kind === "run")).toHaveLength(3);
    });

    it("breaks the run on a gap wider than the window", () => {
        const sections = groupMessages({
            messages: [message({ id: "1" }), message({ id: "2", sentAt: NOON + 6 * MINUTE })],
        });
        expect(sections.filter((s) => s.kind === "run")).toHaveLength(2);
    });

    it("honors a custom window", () => {
        const sections = groupMessages({
            messages: [message({ id: "1" }), message({ id: "2", sentAt: NOON + 6 * MINUTE })],
            windowMs: 10 * MINUTE,
        });
        expect(sections.filter((s) => s.kind === "run")).toHaveLength(1);
    });

    it("starts a new day and a new run when the date changes", () => {
        const sections = groupMessages({
            messages: [message({ id: "1" }), message({ id: "2", sentAt: NOON + DAY })],
        });
        expect(sections.map((s) => s.kind)).toEqual(["day", "run", "day", "run"]);
    });

    it("marks the current user's runs as own", () => {
        const sections = groupMessages({
            messages: [
                message({ id: "1" }),
                message({ id: "2", authorId: "bruno", sentAt: NOON + 6 * MINUTE }),
            ],
            currentUserId: "ana",
        });
        const runs = sections.filter((s) => s.kind === "run");
        expect(runs.map((r) => r.kind === "run" && r.own)).toEqual([true, false]);
    });

    it("marks nothing as own without a current user", () => {
        const sections = groupMessages({ messages: [message({ id: "1" })] });
        expect(sections.some((s) => s.kind === "run" && s.own)).toBe(false);
    });

    it("never reorders what it was given", () => {
        // An optimistic insert is deliberately last even when its clock is behind.
        const sections = groupMessages({
            messages: [
                message({ id: "1", sentAt: NOON + 10 * MINUTE }),
                message({ id: "2", sentAt: NOON, authorId: "bruno" }),
            ],
        });
        const ids = sections.flatMap((s) => (s.kind === "run" ? s.messages.map((m) => m.id) : []));
        expect(ids).toEqual(["1", "2"]);
    });

    it("gives each run a key that survives a re-render", () => {
        const messages = [message({ id: "1" })];
        const a = groupMessages({ messages });
        const b = groupMessages({ messages });
        expect(a.map((s) => s.key)).toEqual(b.map((s) => s.key));
    });
});

describe("dayLabel", () => {
    const midnight = (offsetDays: number) => {
        const date = new Date(NOON);
        date.setHours(0, 0, 0, 0);
        return date.getTime() + offsetDays * DAY;
    };

    it("says today and yesterday", () => {
        expect(dayLabel(midnight(0), { now: NOON })).toBe("Hoje");
        expect(dayLabel(midnight(-1), { now: NOON })).toBe("Ontem");
        expect(dayLabel(midnight(0), { locale: "en", now: NOON })).toBe("Today");
        expect(dayLabel(midnight(-1), { locale: "en", now: NOON })).toBe("Yesterday");
    });

    it("formats an older day", () => {
        const label = dayLabel(midnight(-5), { now: NOON });
        expect(label).not.toBe("Hoje");
        expect(label).toMatch(/\d{2}/);
    });
});

describe("timeLabel", () => {
    it("shows the clock time, not a relative phrase", () => {
        expect(timeLabel(new Date(2026, 2, 10, 9, 5).getTime())).toMatch(/09[:h]05/);
    });
});

describe("typingLabel", () => {
    it("is null when nobody is typing", () => {
        expect(typingLabel([])).toBeNull();
    });

    it("names one and two people, then counts", () => {
        expect(typingLabel(["Ana"])).toBe("Ana está digitando…");
        expect(typingLabel(["Ana", "Bruno"])).toBe("Ana e Bruno estão digitando…");
        expect(typingLabel(["Ana", "Bruno", "Cida"])).toBe("3 pessoas estão digitando…");
    });

    it("phrases it in English too", () => {
        expect(typingLabel(["Ana"], "en")).toBe("Ana is typing…");
        expect(typingLabel(["Ana", "Bruno", "Cida"], "en")).toBe("3 people are typing…");
    });
});
