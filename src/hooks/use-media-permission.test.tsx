import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { installPermissions, removePermissions } from "../../test/audio-mocks";
import { useMediaPermission, type MediaPermissionName } from "./use-media-permission";

function Probe({ name = "microphone" as MediaPermissionName }) {
    const { state, supported, refresh } = useMediaPermission(name);
    return (
        <div>
            <span data-testid="state">{state}</span>
            <span data-testid="supported">{String(supported)}</span>
            <button type="button" onClick={refresh}>
                refresh
            </button>
        </div>
    );
}

describe("useMediaPermission", () => {
    const restores: Array<() => void> = [];
    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("reads the state without asking for the device", async () => {
        const permissions = installPermissions("prompt");
        restores.push(permissions.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("prompt"));
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
    });

    it("distinguishes granted from denied", async () => {
        const permissions = installPermissions("granted");
        restores.push(permissions.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("granted"));
    });

    it("follows a change made in site settings", async () => {
        const permissions = installPermissions("prompt");
        restores.push(permissions.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("prompt"));

        act(() => permissions.change("denied"));
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("denied"));
    });

    it("reports unknown when the Permissions API rejects the name (Safari)", async () => {
        // Safari throws for `microphone`. That is "you will have to ask to find out",
        // not an error.
        const permissions = installPermissions("reject");
        restores.push(permissions.restore);

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
        expect(screen.getByTestId("state")).toHaveTextContent("unknown");
    });

    it("reports unknown with no Permissions API at all", async () => {
        restores.push(removePermissions());

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId("supported")).toHaveTextContent("false"));
        expect(screen.getByTestId("state")).toHaveTextContent("unknown");
    });

    it("re-reads on refresh", async () => {
        const permissions = installPermissions("prompt");
        restores.push(permissions.restore);

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("prompt"));

        permissions.change("granted");
        act(() => screen.getByRole("button", { name: "refresh" }).click());
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("granted"));
    });

    it("queries the camera when asked", async () => {
        const permissions = installPermissions("granted");
        restores.push(permissions.restore);

        render(<Probe name="camera" />);
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("granted"));
    });
});
