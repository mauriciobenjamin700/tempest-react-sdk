import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
    it("renders title + description + action", () => {
        render(
            <EmptyState
                title="Empty"
                description="Nothing here"
                action={<button>Create</button>}
            />,
        );
        expect(screen.getByText("Empty")).toBeInTheDocument();
        expect(screen.getByText("Nothing here")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    });
});
