import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Wizard } from "./Wizard";
import type { WizardStep } from "./Wizard";

const steps: WizardStep[] = [
    { id: "one", label: "Dados", content: <p>Passo 1</p> },
    { id: "two", label: "Endereço", content: <p>Passo 2</p> },
    { id: "three", label: "Revisão", content: <p>Passo 3</p> },
];

describe("Wizard", () => {
    it("renders the indicator and only the active step body", () => {
        render(<Wizard steps={steps} />);

        expect(screen.getByText("Dados")).toBeInTheDocument();
        expect(screen.getByText("Passo 1")).toBeInTheDocument();
        expect(screen.queryByText("Passo 2")).not.toBeInTheDocument();
    });

    it("advances and goes back", async () => {
        render(<Wizard steps={steps} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByText("Passo 2")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("disables Back on the first step", () => {
        render(<Wizard steps={steps} />);
        expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    });

    it("shows the finish label on the last step and calls onComplete", async () => {
        const onComplete = vi.fn();
        render(<Wizard steps={steps} defaultActiveIndex={2} onComplete={onComplete} />);

        const finish = screen.getByRole("button", { name: "Finish" });
        await userEvent.click(finish);

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("honours custom button labels", () => {
        render(<Wizard steps={steps} nextLabel="Avançar" backLabel="Voltar" />);
        expect(screen.getByRole("button", { name: "Avançar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    });

    it("blocks the advance when validate returns false", async () => {
        const validate = vi.fn().mockReturnValue(false);
        render(<Wizard steps={[{ ...steps[0], validate }, steps[1]]} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(validate).toHaveBeenCalled();
        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("advances when an async validate resolves true", async () => {
        const validate = vi.fn().mockResolvedValue(true);
        render(<Wizard steps={[{ ...steps[0], validate }, steps[1]]} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(screen.getByText("Passo 2")).toBeInTheDocument();
    });

    it("treats a throwing validate as a blocked advance", async () => {
        const validate = vi.fn().mockRejectedValue(new Error("network"));
        render(<Wizard steps={[{ ...steps[0], validate }, steps[1]]} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("reports every step change", async () => {
        const onStepChange = vi.fn();
        render(<Wizard steps={steps} onStepChange={onStepChange} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(onStepChange).toHaveBeenCalledWith(1, expect.objectContaining({ id: "two" }));
    });

    it("stays on the controlled index until the parent moves it", async () => {
        const onStepChange = vi.fn();
        render(<Wizard steps={steps} activeIndex={0} onStepChange={onStepChange} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());
        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("clamps a controlled index past the end", () => {
        render(<Wizard steps={steps} activeIndex={99} />);
        expect(screen.getByText("Passo 3")).toBeInTheDocument();
    });

    it("keeps the indicator read-only by default", () => {
        render(<Wizard steps={steps} />);
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("jumps backwards from the indicator without validating", async () => {
        const validate = vi.fn().mockReturnValue(false);
        render(
            <Wizard
                steps={[{ ...steps[0], validate }, steps[1], steps[2]]}
                defaultActiveIndex={2}
                clickableSteps
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /Dados/ }));

        expect(screen.getByText("Passo 1")).toBeInTheDocument();
        expect(validate).not.toHaveBeenCalled();
    });

    it("validates every step crossed on a forward jump", async () => {
        const first = vi.fn().mockReturnValue(true);
        const second = vi.fn().mockReturnValue(false);
        render(
            <Wizard
                steps={[
                    { ...steps[0], validate: first },
                    { ...steps[1], validate: second },
                    steps[2],
                ]}
                clickableSteps
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /Revisão/ }));

        expect(first).toHaveBeenCalled();
        expect(second).toHaveBeenCalled();
        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("completes a forward jump when every gate passes", async () => {
        render(
            <Wizard
                steps={[
                    { ...steps[0], validate: () => true },
                    { ...steps[1], validate: () => true },
                    steps[2],
                ]}
                clickableSteps
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /Revisão/ }));

        expect(screen.getByText("Passo 3")).toBeInTheDocument();
    });

    it("ignores a jump to the current step", async () => {
        const onStepChange = vi.fn();
        render(<Wizard steps={steps} clickableSteps onStepChange={onStepChange} />);

        await userEvent.click(screen.getByRole("button", { name: /Dados/ }));

        expect(onStepChange).not.toHaveBeenCalled();
    });

    it("clamps an out-of-range jump to the last step", async () => {
        render(
            <Wizard
                steps={steps}
                clickableSteps
                renderActions={({ goTo }) => (
                    <button type="button" onClick={() => void goTo(42)}>
                        far
                    </button>
                )}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "far" }));

        expect(screen.getByText("Passo 3")).toBeInTheDocument();
    });

    it("hands the flow controls to a function body", () => {
        render(
            <Wizard
                steps={[
                    {
                        id: "one",
                        label: "Dados",
                        content: ({ activeIndex, isFirst, isLast }) => (
                            <p>{`${activeIndex}-${isFirst}-${isLast}`}</p>
                        ),
                    },
                ]}
            />,
        );

        expect(screen.getByText("0-true-true")).toBeInTheDocument();
    });

    it("replaces the button row with renderActions", async () => {
        render(
            <Wizard
                steps={steps}
                renderActions={({ next }) => (
                    <button type="button" onClick={() => void next()}>
                        continuar
                    </button>
                )}
            />,
        );

        expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "continuar" }));
        expect(screen.getByText("Passo 2")).toBeInTheDocument();
    });

    it("ignores back on the first step through the controls", async () => {
        render(
            <Wizard
                steps={steps}
                renderActions={({ back }) => (
                    <button type="button" onClick={back}>
                        voltar
                    </button>
                )}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "voltar" }));

        expect(screen.getByText("Passo 1")).toBeInTheDocument();
    });

    it("marks an optional step in the indicator", () => {
        render(
            <Wizard steps={[{ ...steps[0], optional: true, description: "extra" }, steps[1]]} />,
        );
        expect(screen.getByText("extra (optional)")).toBeInTheDocument();
    });

    it("localizes the optional suffix", () => {
        render(
            <Wizard
                optionalLabel="(opcional)"
                steps={[{ ...steps[0], optional: true, description: "extra" }, steps[1]]}
            />,
        );
        expect(screen.getByText("extra (opcional)")).toBeInTheDocument();
    });

    it("uses the suffix alone when an optional step has no description", () => {
        render(<Wizard steps={[{ ...steps[0], optional: true }, steps[1]]} />);
        expect(screen.getByText("(optional)")).toBeInTheDocument();
    });

    it("shows the plain description when the step is not optional", () => {
        render(<Wizard steps={[{ ...steps[0], description: "dados básicos" }, steps[1]]} />);
        expect(screen.getByText("dados básicos")).toBeInTheDocument();
    });

    it("labels the body group with the active step", () => {
        render(<Wizard steps={steps} />);
        expect(screen.getByRole("group", { name: "Dados" })).toBeInTheDocument();
    });

    it("accepts an extra className", () => {
        const { container } = render(<Wizard steps={steps} className="mine" />);
        expect(container.firstElementChild).toHaveClass("mine");
    });
});
