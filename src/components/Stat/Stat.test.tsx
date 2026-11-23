import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stat } from "./Stat";

describe("Stat", () => {
    it("renders label and value", () => {
        render(<Stat label="Revenue" value="R$ 12.345" />);
        expect(screen.getByText("Revenue")).toBeInTheDocument();
        expect(screen.getByText("R$ 12.345")).toBeInTheDocument();
    });

    it("infers trend up from leading +", () => {
        const { container } = render(<Stat label="x" value="1" delta="+10%" />);
        expect(container.innerHTML).toMatch(/up/);
    });

    it("infers trend down from leading -", () => {
        const { container } = render(<Stat label="x" value="1" delta="-5%" />);
        expect(container.innerHTML).toMatch(/down/);
    });

    it("respects explicit trend prop", () => {
        const { container } = render(<Stat label="x" value="1" delta="0" trend="flat" />);
        expect(container.innerHTML).toMatch(/flat/);
    });

    it("renders hint when provided", () => {
        render(<Stat label="x" value="1" hint="vs. last month" />);
        expect(screen.getByText("vs. last month")).toBeInTheDocument();
    });

    it("infers no trend from a delta that carries no sign", () => {
        const { container } = render(<Stat label="Pedidos" value="120" delta="estável" />);
        expect(container.querySelector('[class*="up"]')).toBeNull();
        expect(container.querySelector('[class*="down"]')).toBeNull();
    });

    it("paints a rise as good news by default", () => {
        const { container } = render(<Stat label="Receita" value="1" delta="+10%" />);
        const delta = container.querySelector("[data-trend]");
        expect(delta).toHaveAttribute("data-trend", "up");
        expect(delta).toHaveAttribute("data-tone", "positive");
        expect(delta?.className).toMatch(/positive/);
    });

    it("paints a rise as bad news when higherIsBetter is false", () => {
        const { container } = render(
            <Stat label="Faltas" value="7,5%" delta="+1,2 p.p." higherIsBetter={false} />,
        );
        const delta = container.querySelector("[data-trend]");
        expect(delta).toHaveAttribute("data-trend", "up");
        expect(delta).toHaveAttribute("data-tone", "negative");
        expect(delta?.className).toMatch(/negative/);
        expect(delta?.className).not.toMatch(/positive/);
    });

    it("paints a fall as good news when higherIsBetter is false", () => {
        const { container } = render(
            <Stat label="Churn" value="2%" delta="-0,3%" higherIsBetter={false} />,
        );
        expect(container.querySelector("[data-trend]")).toHaveAttribute("data-tone", "positive");
    });

    it("keeps a flat delta neutral whatever the polarity", () => {
        const { container } = render(
            <Stat label="NPS" value="78" delta="0" trend="flat" higherIsBetter={false} />,
        );
        expect(container.querySelector("[data-trend]")).toHaveAttribute("data-tone", "neutral");
    });

    it("leaves a delta of unknown direction without a tone", () => {
        const { container } = render(<Stat label="Pedidos" value="120" delta="estável" />);
        const delta = screen.getByText("estável");
        expect(delta).not.toHaveAttribute("data-tone");
        expect(container.querySelector('[class*="positive"], [class*="negative"]')).toBeNull();
    });
});
