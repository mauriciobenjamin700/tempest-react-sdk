import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TruncateText } from "./TruncateText";

describe("TruncateText", () => {
    it("renders its children", () => {
        render(<TruncateText>Some long body of text</TruncateText>);
        expect(screen.getByText("Some long body of text")).toBeInTheDocument();
    });

    it("sets the line-clamp custom property", () => {
        const { container } = render(<TruncateText lines={3}>x</TruncateText>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.getPropertyValue("--tempest-clamp-lines")).toBe("3");
    });
});
