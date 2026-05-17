import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Form, FormActions, FormRow, FormSection } from "./Form";

describe("Form", () => {
    it("renders a <form> element with the stack layout class by default", () => {
        const { container } = render(
            <Form data-testid="form">
                <input name="email" />
            </Form>,
        );
        const form = container.querySelector("form");
        expect(form).not.toBeNull();
        expect(form?.className).toMatch(/stack/);
    });

    it("applies grid template columns when layout='grid'", () => {
        const { container } = render(
            <Form layout="grid" columns={3} data-testid="form">
                <input />
                <input />
                <input />
            </Form>,
        );
        const form = container.querySelector("form")!;
        expect(form.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    });

    it("accepts a custom grid-template-columns string", () => {
        const { container } = render(
            <Form layout="grid" columns="2fr 1fr">
                <input />
                <input />
            </Form>,
        );
        expect(container.querySelector("form")!.style.gridTemplateColumns).toBe("2fr 1fr");
    });

    it("converts numeric gap to a 4px scale", () => {
        const { container } = render(
            <Form gap={6}>
                <input />
            </Form>,
        );
        expect(container.querySelector("form")!.style.gap).toBe("24px");
    });

    it("accepts a custom gap string", () => {
        const { container } = render(
            <Form gap="1.5rem">
                <input />
            </Form>,
        );
        expect(container.querySelector("form")!.style.gap).toBe("1.5rem");
    });

    it("forwards onSubmit to the underlying form element", async () => {
        const onSubmit = vi.fn((event) => event.preventDefault());
        render(
            <Form onSubmit={onSubmit}>
                <button type="submit">Send</button>
            </Form>,
        );
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

describe("FormSection", () => {
    it("renders title and description when provided", () => {
        render(
            <FormSection title="Endereço" description="Usado para entrega">
                <input />
            </FormSection>,
        );
        expect(screen.getByRole("heading", { name: "Endereço" })).toBeInTheDocument();
        expect(screen.getByText("Usado para entrega")).toBeInTheDocument();
    });

    it("omits the header element when no title and no description", () => {
        const { container } = render(
            <FormSection>
                <input />
            </FormSection>,
        );
        expect(container.querySelector("header")).toBeNull();
    });

    it("applies grid template columns to the body when layout='grid'", () => {
        const { container } = render(
            <FormSection layout="grid" columns={4}>
                <input />
            </FormSection>,
        );
        const body = container.querySelector("section > div")!;
        expect((body as HTMLElement).style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    });
});

describe("FormRow", () => {
    it("forces a horizontal row container", () => {
        const { container } = render(
            <FormRow>
                <input />
                <input />
            </FormRow>,
        );
        const row = container.firstElementChild as HTMLElement;
        expect(row.className).toMatch(/row/);
    });

    it("converts numeric gap to a 4px scale", () => {
        const { container } = render(
            <FormRow gap={5}>
                <input />
            </FormRow>,
        );
        expect((container.firstElementChild as HTMLElement).style.gap).toBe("20px");
    });
});

describe("FormActions", () => {
    it("defaults to align='end'", () => {
        const { container } = render(
            <FormActions>
                <button>Save</button>
            </FormActions>,
        );
        expect((container.firstElementChild as HTMLElement).className).toMatch(/end/);
    });

    it("applies the requested align class", () => {
        const { container } = render(
            <FormActions align="between">
                <button>A</button>
                <button>B</button>
            </FormActions>,
        );
        expect((container.firstElementChild as HTMLElement).className).toMatch(/between/);
    });
});
