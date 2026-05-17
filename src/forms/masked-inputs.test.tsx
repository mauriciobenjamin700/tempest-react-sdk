import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CEPInput, CNPJInput, CPFInput, MoneyInput, PhoneInput } from "./masked-inputs";

function ControlledCPF() {
    const [v, setV] = useState("");
    return <CPFInput value={v} onChange={setV} label="CPF" placeholder="cpf" />;
}

describe("CPFInput", () => {
    it("masks the value as user types", () => {
        render(<ControlledCPF />);
        const input = screen.getByPlaceholderText("cpf") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "12345678900" } });
        expect(input.value).toBe("123.456.789-00");
    });
});

function ControlledCNPJ() {
    const [v, setV] = useState("");
    return <CNPJInput value={v} onChange={setV} placeholder="cnpj" />;
}

describe("CNPJInput", () => {
    it("masks 14 digits", () => {
        render(<ControlledCNPJ />);
        const input = screen.getByPlaceholderText("cnpj") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "11222333000181" } });
        expect(input.value).toBe("11.222.333/0001-81");
    });
});

function ControlledPhone() {
    const [v, setV] = useState("");
    return <PhoneInput value={v} onChange={setV} placeholder="phone" />;
}

describe("PhoneInput", () => {
    it("masks mobile number", () => {
        render(<ControlledPhone />);
        const input = screen.getByPlaceholderText("phone") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "11987654321" } });
        expect(input.value).toBe("(11) 98765-4321");
    });
});

function ControlledCEP() {
    const [v, setV] = useState("");
    return <CEPInput value={v} onChange={setV} placeholder="cep" />;
}

describe("CEPInput", () => {
    it("masks 8 digits", () => {
        render(<ControlledCEP />);
        const input = screen.getByPlaceholderText("cep") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "01310100" } });
        expect(input.value).toBe("01310-100");
    });
});

function ControlledMoney() {
    const [v, setV] = useState(0);
    return (
        <>
            <MoneyInput value={v} onChange={setV} placeholder="money" />
            <span data-testid="cents">{v}</span>
        </>
    );
}

describe("MoneyInput", () => {
    it("stores value as cents", () => {
        render(<ControlledMoney />);
        const input = screen.getByPlaceholderText("money") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "12990" } });
        expect(screen.getByTestId("cents").textContent).toBe("12990");
        expect(input.value).toContain("129,90");
    });
});
