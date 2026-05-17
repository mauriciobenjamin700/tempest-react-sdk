import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

const items = [
    { id: "a", label: "A", content: <p>panel-a</p> },
    { id: "b", label: "B", content: <p>panel-b</p> },
    { id: "c", label: "C", content: <p>panel-c</p>, disabled: true },
];

describe("Tabs", () => {
    it("renders the first non-disabled panel by default", () => {
        render(<Tabs items={items} />);
        expect(screen.getByText("panel-a")).toBeInTheDocument();
    });

    it("switches panel on click", async () => {
        render(<Tabs items={items} />);
        await userEvent.click(screen.getByRole("tab", { name: "B" }));
        expect(screen.getByText("panel-b")).toBeInTheDocument();
    });

    it("respects disabled tabs", () => {
        render(<Tabs items={items} />);
        const disabledTab = screen.getByRole("tab", { name: "C" });
        expect(disabledTab).toBeDisabled();
    });
});
