import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RouteGuard } from "./RouteGuard";

function renderAt(when: boolean, path = "/secret") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/login" element={<span>login</span>} />
                <Route
                    path="/secret"
                    element={
                        <RouteGuard when={when} redirectTo="/login">
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
});
