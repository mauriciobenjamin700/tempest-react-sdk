import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelativeTime } from "./RelativeTime";

describe("RelativeTime", () => {
    it("renders a <time> element with dateTime and text", () => {
        const date = new Date(Date.now() - 90_000);
        const { container } = render(<RelativeTime date={date} />);
        const el = container.querySelector("time");

        expect(el).toBeTruthy();
        expect(el?.getAttribute("dateTime")).toBe(date.toISOString());
        expect(el?.textContent?.length).toBeGreaterThan(0);
    });

    it("respects the en locale", () => {
        const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const { container } = render(<RelativeTime date={date} locale="en" />);
        expect(container.querySelector("time")?.textContent).toContain("ago");
    });
});
