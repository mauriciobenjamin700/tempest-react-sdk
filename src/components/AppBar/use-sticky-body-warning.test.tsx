import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBar } from "./AppBar";
import { resetDevWarnings } from "@/utils/dev-warn";

/**
 * What the development warning has to get right.
 *
 * The bug it reports is invisible from the component's side — the bar keeps
 * `position: sticky`, the markup is unchanged, and only a page long enough to
 * scroll shows the symptom — so the console line is the entire feature. Two
 * properties matter: it fires on the declaration that actually breaks sticky,
 * and it stays quiet otherwise. A warning that cries wolf on the many apps
 * whose body is a scroll container **on purpose** would be turned off, and then
 * it protects nobody.
 */
describe("AppBar — sticky body warning", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetDevWarnings();
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
        document.body.style.removeProperty("overflow-x");
        document.body.style.removeProperty("overflow-y");
    });

    it("warns when the body clamps overflow-x with hidden", () => {
        document.body.style.overflowX = "hidden";
        render(<AppBar title="x" />);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("overflow-x: clip");
    });

    it("stays quiet when the body clamps with clip", () => {
        document.body.style.overflowX = "clip";
        render(<AppBar title="x" />);
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet on a body that scrolls on purpose", () => {
        document.body.style.overflowY = "auto";
        render(<AppBar title="x" />);
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet for a bar that is not sticky", () => {
        document.body.style.overflowX = "hidden";
        render(<AppBar title="x" sticky={false} />);
        expect(warn).not.toHaveBeenCalled();
    });

    it("warns once, not once per bar", () => {
        document.body.style.overflowX = "hidden";
        render(<AppBar title="a" />);
        render(<AppBar title="b" />);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
