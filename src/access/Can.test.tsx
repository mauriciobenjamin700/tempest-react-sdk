import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AccessControlProvider } from "./access-control-context";
import { Can } from "./Can";
import type { AccessControl } from "./types";

describe("Can", () => {
    it("renders children when allowed", async () => {
        const control: AccessControl = { can: () => true };
        render(
            <AccessControlProvider control={control}>
                <Can action="create" resource="posts" fallback={<span>denied</span>}>
                    <span>allowed</span>
                </Can>
            </AccessControlProvider>,
        );
        await waitFor(() => expect(screen.getByText("allowed")).toBeInTheDocument());
        expect(screen.queryByText("denied")).not.toBeInTheDocument();
    });

    it("renders fallback when denied", async () => {
        const control: AccessControl = { can: () => ({ can: false }) };
        render(
            <AccessControlProvider control={control}>
                <Can action="create" resource="posts" fallback={<span>denied</span>}>
                    <span>allowed</span>
                </Can>
            </AccessControlProvider>,
        );
        await waitFor(() => expect(screen.getByText("denied")).toBeInTheDocument());
        expect(screen.queryByText("allowed")).not.toBeInTheDocument();
    });

    it("renders children with an async allow control", async () => {
        const control: AccessControl = { can: async () => true };
        render(
            <AccessControlProvider control={control}>
                <Can action="read" resource="posts">
                    <span>async-allowed</span>
                </Can>
            </AccessControlProvider>,
        );
        await waitFor(() => expect(screen.getByText("async-allowed")).toBeInTheDocument());
    });

    it("renders children when no provider is present", () => {
        render(
            <Can action="read" resource="posts" fallback={<span>denied</span>}>
                <span>no-provider</span>
            </Can>,
        );
        expect(screen.getByText("no-provider")).toBeInTheDocument();
        expect(screen.queryByText("denied")).not.toBeInTheDocument();
    });
});
