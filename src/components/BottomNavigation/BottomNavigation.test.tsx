import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "./BottomNavigation";

const items = [
    { key: "home", label: "Home" },
    { key: "search", label: "Search" },
    { key: "profile", label: "Profile" },
];

describe("BottomNavigation", () => {
    it("renders all items", () => {
        render(<BottomNavigation items={items} value="home" onChange={() => {}} />);
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Search")).toBeInTheDocument();
        expect(screen.getByText("Profile")).toBeInTheDocument();
    });

    it("marks the selected item with aria-current=page", () => {
        render(<BottomNavigation items={items} value="search" onChange={() => {}} />);
        const selected = screen.getByText("Search").closest("button")!;
        expect(selected).toHaveAttribute("aria-current", "page");
    });

    it("fires onChange with the clicked key", async () => {
        const onChange = vi.fn();
        render(<BottomNavigation items={items} value="home" onChange={onChange} />);
        await userEvent.click(screen.getByText("Profile"));
        expect(onChange).toHaveBeenCalledWith("profile");
    });

    it("hides labels when showLabels=false", () => {
        render(
            <BottomNavigation items={items} value="home" onChange={() => {}} showLabels={false} />,
        );
        expect(screen.queryByText("Home")).toBeNull();
    });

    it("does not fire onChange when item is disabled", async () => {
        const onChange = vi.fn();
        const disabled = [{ ...items[0], disabled: true }, items[1]];
        render(<BottomNavigation items={disabled} value="search" onChange={onChange} />);
        await userEvent.click(screen.getByText("Home"));
        expect(onChange).not.toHaveBeenCalled();
    });
});
