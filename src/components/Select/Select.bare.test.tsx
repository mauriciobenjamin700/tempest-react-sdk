import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Select } from "./Select";
import { toOptions, withEmptyOption } from "./options";

const OPTIONS = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
];

/**
 * `variant="bare"` exists so an app with its own look adopts the SDK control
 * instead of rewriting it. alofans-frontend wrote its own (~45 lines of TSX and
 * 30 of CSS) because the only variants painted a border, background, radius,
 * shadow and height it had to fight.
 */
describe("Select bare variant", () => {
    it("renders the shell as the only wrapper, so the app's flex rules reach it", () => {
        const { container } = render(
            <Select variant="bare" aria-label="Status" wrapperClassName="app" options={OPTIONS} />,
        );

        const shell = container.firstElementChild as HTMLElement;
        expect(shell).toHaveClass("app");
        expect(shell.querySelector(":scope > select")).not.toBeNull();
        expect(shell.querySelector(":scope > span[aria-hidden] > svg")).not.toBeNull();
        expect(container.querySelector("label")).toBeNull();
    });

    it("names the control through aria-label", () => {
        render(<Select variant="bare" aria-label="Status" options={OPTIONS} />);
        expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    });

    it("names the control through aria-labelledby", () => {
        render(
            <>
                <span id="status-label">Situação</span>
                <Select variant="bare" aria-labelledby="status-label" options={OPTIONS} />
            </>,
        );
        expect(screen.getByRole("combobox", { name: "Situação" })).toBeInTheDocument();
    });

    it("refuses at compile time a bare select with no accessible name", () => {
        // @ts-expect-error bare has no visible label, so a name is required
        render(<Select variant="bare" options={OPTIONS} />);
        expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("still takes the native select props and forwards the ref", () => {
        let node: HTMLSelectElement | null = null;
        render(
            <Select
                ref={(el) => {
                    node = el;
                }}
                variant="bare"
                aria-label="Status"
                options={OPTIONS}
                defaultValue="b"
                disabled
            />,
        );
        const control = screen.getByRole("combobox", { name: "Status" });
        expect(control).toBeDisabled();
        expect(control).toHaveValue("b");
        expect(node).toBe(control);
    });

    it("does not leak the variant onto the DOM node", () => {
        render(<Select variant="bare" aria-label="Status" options={OPTIONS} />);
        expect(screen.getByRole("combobox")).not.toHaveAttribute("variant");
    });

    it("keeps a nullable field clearable when built with withEmptyOption", () => {
        render(
            <Select
                variant="bare"
                aria-label="Humor"
                value=""
                onChange={() => undefined}
                options={withEmptyOption(toOptions({ a: "A" }))}
            />,
        );
        expect(screen.getByRole("combobox")).toHaveValue("");
    });
});

describe("Select caretIcon", () => {
    it("replaces the built-in chevron on every variant", () => {
        const icon = <i data-testid="custom-caret" />;
        const { container } = render(
            <>
                <Select aria-label="f" caretIcon={icon} options={OPTIONS} />
                <Select variant="chip" aria-label="c" caretIcon={icon} options={OPTIONS} />
                <Select variant="bare" aria-label="b" caretIcon={icon} options={OPTIONS} />
            </>,
        );
        expect(screen.getAllByTestId("custom-caret")).toHaveLength(3);
        expect(container.querySelector("span[aria-hidden] > svg")).toBeNull();
    });

    it("draws the built-in chevron when no icon is given", () => {
        const { container } = render(<Select aria-label="f" options={OPTIONS} />);
        expect(container.querySelector("span[aria-hidden] > svg")).not.toBeNull();
    });

    it("keeps the caret out of the accessibility tree", () => {
        const { container } = render(
            <Select aria-label="f" caretIcon={<svg data-testid="x" />} options={OPTIONS} />,
        );
        expect(container.querySelector("[data-testid=x]")?.parentElement).toHaveAttribute(
            "aria-hidden",
            "true",
        );
    });
});

describe("the empty-value measurement withEmptyOption is built on", () => {
    /**
     * Measured in jsdom, which implements the HTML selectedness algorithm: a
     * controlled `value=""` with no empty option reads back as the first option,
     * so saving an untouched edit form writes `"a"`. `placeholder` renders its
     * entry `disabled hidden`, so it shows "unset" but cannot be picked again.
     */
    it("a select with no empty option reports its first option for value ''", () => {
        render(<Select aria-label="x" value="" onChange={() => undefined} options={OPTIONS} />);
        expect(screen.getByRole("combobox")).toHaveValue("a");
    });

    it("placeholder's entry cannot be chosen back", () => {
        const { container } = render(
            <Select aria-label="x" placeholder="Escolha" defaultValue="" options={OPTIONS} />,
        );
        const entry = container.querySelector("option[value='']") as HTMLOptionElement;
        expect(entry.disabled).toBe(true);
        expect(entry.hidden).toBe(true);
    });
});
