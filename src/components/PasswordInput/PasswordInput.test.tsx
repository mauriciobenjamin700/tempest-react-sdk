import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordInput, estimatePasswordStrength } from "./PasswordInput";

describe("estimatePasswordStrength", () => {
    it("returns 0 for empty", () => {
        expect(estimatePasswordStrength("")).toBe(0);
    });

    it("scores increasing complexity", () => {
        expect(estimatePasswordStrength("abc")).toBe(0);
        expect(estimatePasswordStrength("abcdefgh")).toBe(1);
        expect(estimatePasswordStrength("abcDEFGH")).toBe(2);
        expect(estimatePasswordStrength("abcDEF12")).toBe(3);
        expect(estimatePasswordStrength("abcDEF12!")).toBe(4);
    });
});

describe("PasswordInput", () => {
    it("renders as type=password by default", () => {
        render(<PasswordInput placeholder="senha" />);
        const input = screen.getByPlaceholderText("senha") as HTMLInputElement;
        expect(input.type).toBe("password");
    });

    it("toggles visibility on button click", async () => {
        render(<PasswordInput placeholder="senha" />);
        const input = screen.getByPlaceholderText("senha") as HTMLInputElement;
        await userEvent.click(screen.getByLabelText("Mostrar senha"));
        expect(input.type).toBe("text");
        await userEvent.click(screen.getByLabelText("Esconder senha"));
        expect(input.type).toBe("password");
    });

    it("renders strength meter when showStrength=true", () => {
        render(<PasswordInput value="abcDEF12!" showStrength readOnly />);
        expect(screen.getByLabelText("Excelente")).toBeInTheDocument();
    });

    it("renders error message + aria-invalid", () => {
        render(<PasswordInput placeholder="x" error="weak" />);
        expect(screen.getByText("weak")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("x")).toHaveAttribute("aria-invalid", "true");
    });

    it("associates the label with the input", () => {
        render(<PasswordInput label="Senha" />);
        expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    });

    it("points aria-describedby at the error, then at the helper text", () => {
        const { unmount } = render(<PasswordInput label="Senha" error="fraca" />);
        const withError = screen.getByLabelText("Senha");
        const errorId = withError.getAttribute("aria-describedby");
        expect(document.getElementById(errorId!)).toHaveTextContent("fraca");
        unmount();

        render(<PasswordInput label="Senha" helperText="mínimo 8 caracteres" />);
        const withHelper = screen.getByLabelText("Senha");
        const helperId = withHelper.getAttribute("aria-describedby");
        expect(document.getElementById(helperId!)).toHaveTextContent("mínimo 8 caracteres");
    });
});
