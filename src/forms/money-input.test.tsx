import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MoneyInput } from "./money-input";

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

    it("keeps the number contract: emptying the field reports 0 and shows R$ 0,00", () => {
        render(<ControlledMoney />);
        const input = screen.getByPlaceholderText("money") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "5" } });
        fireEvent.change(input, { target: { value: "" } });
        expect(screen.getByTestId("cents").textContent).toBe("0");
        expect(input.value).toBe("R$\u00a00,00");
    });
});

function NullableMoney({ name, nameFormat }: { name?: string; nameFormat?: "cents" | "decimal" }) {
    const [v, setV] = useState<number | null>(null);
    return (
        <form data-testid="form">
            <MoneyInput
                nullable
                value={v}
                onChange={setV}
                name={name}
                nameFormat={nameFormat}
                placeholder="R$ 0,00"
                label="Preço"
            />
            <span data-testid="cents">{String(v)}</span>
        </form>
    );
}

describe("MoneyInput nullable", () => {
    it("renders empty with the placeholder visible and reports null once emptied", () => {
        render(<NullableMoney />);
        const input = screen.getByLabelText("Preço") as HTMLInputElement;
        expect(input.value).toBe("");
        fireEvent.change(input, { target: { value: "1234" } });
        expect(input.value).toBe("R$\u00a012,34");
        fireEvent.change(input, { target: { value: "R$\u00a0" } });
        expect(input.value).toBe("");
        expect(screen.getByTestId("cents").textContent).toBe("null");
    });

    it("shows an explicit 0 as R$ 0,00, distinct from null", () => {
        render(<MoneyInput nullable value={0} onChange={() => undefined} placeholder="p" />);
        expect((screen.getByPlaceholderText("p") as HTMLInputElement).value).toBe("R$\u00a00,00");
    });

    it("puts the unformatted cents in FormData under name, not the visible text", () => {
        render(<NullableMoney name="price" />);
        const input = screen.getByLabelText("Preço") as HTMLInputElement;
        const form = screen.getByTestId("form") as HTMLFormElement;
        expect(new FormData(form).get("price")).toBe("");
        fireEvent.change(input, { target: { value: "1234" } });
        expect(new FormData(form).getAll("price")).toEqual(["1234"]);
        expect(input.name).toBe("");
    });

    it("writes reais with a dot when nameFormat is decimal", () => {
        render(<NullableMoney name="price" nameFormat="decimal" />);
        fireEvent.change(screen.getByLabelText("Preço"), { target: { value: "5" } });
        expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("price")).toBe(
            "0.05",
        );
    });

    it("leaves a disabled field out of FormData, like the visible input", () => {
        render(
            <form data-testid="form">
                <MoneyInput value={100} onChange={() => undefined} name="price" disabled />
            </form>,
        );
        expect(new FormData(screen.getByTestId("form") as HTMLFormElement).has("price")).toBe(
            false,
        );
    });

    it("ignores a digit past maxCents", () => {
        const onChange = vi.fn();
        render(<MoneyInput value={999} onChange={onChange} maxCents={1000} placeholder="p" />);
        fireEvent.change(screen.getByPlaceholderText("p"), { target: { value: "R$ 9,999" } });
        expect(onChange).toHaveBeenCalledWith(999);
    });

    it("still runs the caller's focus, click and select handlers", () => {
        const onFocus = vi.fn();
        const onClick = vi.fn();
        const onSelect = vi.fn();
        render(
            <MoneyInput
                value={100}
                onChange={() => undefined}
                onFocus={onFocus}
                onClick={onClick}
                onSelect={onSelect}
                placeholder="p"
            />,
        );
        const input = screen.getByPlaceholderText("p");
        fireEvent.focus(input);
        fireEvent.click(input);
        fireEvent.select(input);
        expect(onFocus).toHaveBeenCalled();
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalled();
    });
});
