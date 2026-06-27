import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { For } from "./For";

describe("For", () => {
    it("renders each item", () => {
        const items = ["a", "b", "c"];
        render(<For each={items}>{(item) => <li key={item}>{item}</li>}</For>);
        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("b")).toBeInTheDocument();
        expect(screen.getByText("c")).toBeInTheDocument();
    });

    it("passes the index to the render function", () => {
        render(
            <For each={["x", "y"]}>
                {(item, index) => (
                    <span key={item}>
                        {index}:{item}
                    </span>
                )}
            </For>,
        );
        expect(screen.getByText("0:x")).toBeInTheDocument();
        expect(screen.getByText("1:y")).toBeInTheDocument();
    });

    it("renders the fallback when empty", () => {
        render(
            <For each={[] as string[]} fallback={<p>empty</p>}>
                {(item) => <li key={item}>{item}</li>}
            </For>,
        );
        expect(screen.getByText("empty")).toBeInTheDocument();
    });

    it("renders nothing when empty and no fallback", () => {
        const { container } = render(
            <For each={[] as string[]}>{(item) => <li key={item}>{item}</li>}</For>,
        );
        expect(container.textContent).toBe("");
    });

    it("infers the item type from each (typed objects)", () => {
        const users = [{ name: "Ann" }, { name: "Bob" }];
        render(<For each={users}>{(user, i) => <li key={i}>{user.name}</li>}</For>);
        expect(screen.getByText("Ann")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
    });
});
