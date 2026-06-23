import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorText } from "./ErrorText";

describe("ErrorText", () => {
    it("renders nothing when there are no children", () => {
        const { container } = render(<ErrorText />);
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing for an empty string", () => {
        const { container } = render(<ErrorText>{""}</ErrorText>);
        expect(container.firstChild).toBeNull();
    });

    it("renders an alert with the message", () => {
        render(<ErrorText>Required field</ErrorText>);
        const alert = screen.getByRole("alert");
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).toBe("Required field");
        expect(alert.tagName).toBe("P");
    });

    it("forwards paragraph attributes", () => {
        render(<ErrorText id="email-error">Invalid</ErrorText>);
        expect(screen.getByRole("alert").id).toBe("email-error");
    });
});
