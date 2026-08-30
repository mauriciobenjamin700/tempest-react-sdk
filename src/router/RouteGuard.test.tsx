import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { RouteGuard } from "./RouteGuard";
import type { RouteGuardResult } from "./types";

function renderAt(when: RouteGuardResult, fallback?: React.ReactNode, path = "/secret") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/login" element={<span>login</span>} />
                <Route
                    path="/secret"
                    element={
                        <RouteGuard when={when} fallback={fallback} redirectTo="/login">
                            <span>secret</span>
                        </RouteGuard>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );
}

describe("RouteGuard", () => {
    it("renders children when allowed", () => {
        renderAt(true);
        expect(screen.getByText("secret")).toBeInTheDocument();
    });

    it("redirects to fallback when not allowed", () => {
        renderAt(false);
        expect(screen.getByText("login")).toBeInTheDocument();
        expect(screen.queryByText("secret")).not.toBeInTheDocument();
    });

    it("holds on pending instead of redirecting someone who may well be allowed", () => {
        renderAt("pending", <span>checking</span>);
        expect(screen.getByText("checking")).toBeInTheDocument();
        expect(screen.queryByText("login")).not.toBeInTheDocument();
    });

    it("holds on pending instead of showing the screen to someone who may not be", () => {
        renderAt("pending", <span>checking</span>);
        expect(screen.queryByText("secret")).not.toBeInTheDocument();
    });

    it("renders nothing while pending when no fallback is given", () => {
        const { container } = renderAt("pending");
        expect(container).toBeEmptyDOMElement();
    });
});
