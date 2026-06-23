import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConditionalWrapper } from "./ConditionalWrapper";

describe("ConditionalWrapper", () => {
    it("wraps children when condition is true", () => {
        render(
            <ConditionalWrapper
                condition={true}
                wrapper={(children) => <a href="/x">{children}</a>}
            >
                <span>label</span>
            </ConditionalWrapper>,
        );
        const link = screen.getByRole("link");
        expect(link).toBeInTheDocument();
        expect(link.textContent).toBe("label");
    });

    it("does not wrap children when condition is false", () => {
        render(
            <ConditionalWrapper
                condition={false}
                wrapper={(children) => <a href="/x">{children}</a>}
            >
                <span>label</span>
            </ConditionalWrapper>,
        );
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.getByText("label")).toBeInTheDocument();
    });
});
