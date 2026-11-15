import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeLinkClick } from "./link-click";

function Anchor({
    route,
    target,
    href = "/docs",
}: {
    route?: () => void;
    target?: string;
    href?: string | null;
}) {
    return (
        <a
            href={href ?? undefined}
            target={target}
            onClick={(event) => routeLinkClick(event, route)}
        >
            Docs
        </a>
    );
}

describe("routeLinkClick", () => {
    it("prevents the browser and routes a plain primary click", () => {
        const route = vi.fn();
        render(<Anchor route={route} />);
        expect(fireEvent.click(screen.getByText("Docs"))).toBe(false);
        expect(route).toHaveBeenCalledTimes(1);
    });

    it("routes a plain click on an anchor whose target is _self", () => {
        const route = vi.fn();
        render(<Anchor route={route} target="_self" />);
        expect(fireEvent.click(screen.getByText("Docs"))).toBe(false);
        expect(route).toHaveBeenCalledTimes(1);
    });

    it.each(["_SELF", "_Self"])(
        "routes a plain click whatever the case of target=%j, as browsers match it",
        (target) => {
            const route = vi.fn();
            render(<Anchor route={route} target={target} />);
            expect(fireEvent.click(screen.getByText("Docs"))).toBe(false);
            expect(route).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        ["ctrl", { ctrlKey: true }],
        ["meta", { metaKey: true }],
        ["shift", { shiftKey: true }],
        ["alt", { altKey: true }],
        ["non-primary-button", { button: 1 }],
    ])("leaves a %s click to the browser without routing", (_name, init) => {
        const route = vi.fn();
        render(<Anchor route={route} />);
        expect(fireEvent.click(screen.getByText("Docs"), init)).toBe(true);
        expect(route).not.toHaveBeenCalled();
    });

    it('leaves a click on a target="_blank" anchor to the browser without routing', () => {
        const route = vi.fn();
        render(<Anchor route={route} target="_blank" />);
        expect(fireEvent.click(screen.getByText("Docs"))).toBe(true);
        expect(route).not.toHaveBeenCalled();
    });

    it("leaves a padded target to the browser, which treats it as a named context", () => {
        const route = vi.fn();
        render(<Anchor route={route} target=" _self " />);
        expect(fireEvent.click(screen.getByText("Docs"))).toBe(true);
        expect(route).not.toHaveBeenCalled();
    });

    it("lets the browser follow the href when nothing routes it", () => {
        render(<Anchor />);
        expect(fireEvent.click(screen.getByText("Docs"))).toBe(true);
    });

    it("routes every click on an anchor without href, since the browser has nothing to follow", () => {
        const route = vi.fn();
        render(<Anchor route={route} href={null} />);
        fireEvent.click(screen.getByText("Docs"), { ctrlKey: true });
        expect(route).toHaveBeenCalledTimes(1);
    });
});
