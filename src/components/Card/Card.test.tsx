import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
    it("renders children", () => {
        render(<Card>content</Card>);
        expect(screen.getByText("content")).toBeInTheDocument();
    });

    it("renders title + actions when provided", () => {
        render(<Card title="t" actions={<span>a</span>}>body</Card>);
        expect(screen.getByText("t")).toBeInTheDocument();
        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("body")).toBeInTheDocument();
    });
});
