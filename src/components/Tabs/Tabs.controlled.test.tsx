import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

describe("Tabs controlled + pill", () => {
    it("respects activeId prop (controlled)", async () => {
        function Wrapper() {
            const [id, setId] = useState("b");
            return (
                <>
                    <button onClick={() => setId("a")}>force-a</button>
                    <Tabs
                        activeId={id}
                        onChange={setId}
                        items={[
                            { id: "a", label: "A", content: <p>panel-a</p> },
                            { id: "b", label: "B", content: <p>panel-b</p> },
                        ]}
                    />
                </>
            );
        }
        render(<Wrapper />);
        expect(screen.getByText("panel-b")).toBeInTheDocument();
        await userEvent.click(screen.getByText("force-a"));
        expect(screen.getByText("panel-a")).toBeInTheDocument();
    });

    it("calls onChange when uncontrolled tab is clicked", async () => {
        const onChange = vi.fn();
        render(
            <Tabs
                onChange={onChange}
                items={[
                    { id: "a", label: "A", content: <p>a</p> },
                    { id: "b", label: "B", content: <p>b</p> },
                ]}
            />,
        );
        await userEvent.click(screen.getByRole("tab", { name: "B" }));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("renders pill variant", () => {
        const { container } = render(
            <Tabs variant="pill" items={[{ id: "a", label: "A", content: <p>a</p> }]} />,
        );
        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist?.className).toContain("pill");
    });

    it("respects defaultId", () => {
        render(
            <Tabs
                defaultId="b"
                items={[
                    { id: "a", label: "A", content: <p>a</p> },
                    { id: "b", label: "B", content: <p>b</p> },
                ]}
            />,
        );
        expect(screen.getByText("b")).toBeInTheDocument();
    });
});
