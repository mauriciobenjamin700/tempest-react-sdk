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
});
