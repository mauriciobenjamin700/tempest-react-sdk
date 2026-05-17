import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthGuard } from "./AuthGuard";

describe("AuthGuard", () => {
    it("renders children when authenticated", () => {
        render(
            <AuthGuard isAuthenticated fallback={<span>fallback</span>}>
                <span>protected</span>
            </AuthGuard>,
        );
        expect(screen.getByText("protected")).toBeInTheDocument();
    });

    it("renders fallback when unauthenticated", () => {
        render(
            <AuthGuard isAuthenticated={false} fallback={<span>fallback</span>}>
                <span>protected</span>
            </AuthGuard>,
        );
        expect(screen.getByText("fallback")).toBeInTheDocument();
    });
});
