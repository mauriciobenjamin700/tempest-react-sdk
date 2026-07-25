import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AvatarGroup } from "./AvatarGroup";

const people = [
    { name: "Ada Lovelace" },
    { name: "Grace Hopper" },
    { name: "Alan Turing" },
    { name: "Edsger Dijkstra" },
    { name: "Barbara Liskov" },
];

describe("AvatarGroup", () => {
    it("groups the avatars under one accessible name", () => {
        render(<AvatarGroup items={people.slice(0, 2)} label="Participantes" />);
        expect(screen.getByRole("group", { name: "Participantes" })).toBeInTheDocument();
    });

    it("shows every avatar when the list fits", () => {
        render(<AvatarGroup items={people.slice(0, 3)} max={4} />);

        expect(screen.getByText("AL")).toBeInTheDocument();
        expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it("collapses the tail into a +N chip", () => {
        render(<AvatarGroup items={people} max={3} />);

        expect(screen.getByText("+2")).toBeInTheDocument();
        expect(screen.getByLabelText("2 more")).toBeInTheDocument();
    });

    it("defaults to four visible avatars", () => {
        render(<AvatarGroup items={people} />);
        expect(screen.getByText("+1")).toBeInTheDocument();
    });

    it("keeps the chip unfocusable without a handler", () => {
        render(<AvatarGroup items={people} max={2} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("turns the chip into a button when a handler is given", async () => {
        const onOverflowClick = vi.fn();
        render(<AvatarGroup items={people} max={2} onOverflowClick={onOverflowClick} />);

        await userEvent.click(screen.getByRole("button", { name: "3 more" }));

        expect(onOverflowClick).toHaveBeenCalledTimes(1);
    });

    it("collapses everything when max is zero", () => {
        render(<AvatarGroup items={people} max={0} />);
        expect(screen.getByText("+5")).toBeInTheDocument();
    });

    it("treats a negative max as zero", () => {
        render(<AvatarGroup items={people} max={-3} />);
        expect(screen.getByText("+5")).toBeInTheDocument();
    });

    it("renders nothing extra for an empty list", () => {
        render(<AvatarGroup items={[]} label="Ninguém" />);

        expect(screen.getByRole("group", { name: "Ninguém" })).toBeEmptyDOMElement();
    });

    it("passes the image through to the avatar", () => {
        render(<AvatarGroup items={[{ name: "Ada Lovelace", src: "/ada.png" }]} />);
        expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveAttribute(
            "src",
            "/ada.png",
        );
    });

    it("applies the size to avatars and to the chip", () => {
        const { container } = render(<AvatarGroup items={people} max={1} size="lg" />);
        expect(container.firstElementChild?.className).toMatch(/lg/);
    });

    it("accepts an extra className", () => {
        render(<AvatarGroup items={people} className="mine" label="g" />);
        expect(screen.getByRole("group")).toHaveClass("mine");
    });
});
