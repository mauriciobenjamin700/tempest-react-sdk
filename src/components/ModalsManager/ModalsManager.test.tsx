import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalsProvider, useModals } from "./ModalsManager";

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useModals>) => void }) {
    const api = useModals();
    return (
        <button type="button" onClick={() => onReady(api)}>
            trigger
        </button>
    );
}

describe("ModalsManager", () => {
    it("open() shows a content modal", async () => {
        const user = userEvent.setup();
        render(
            <ModalsProvider>
                <Harness onReady={(api) => api.open({ title: "Hello", children: "Body text" })} />
            </ModalsProvider>,
        );
        await user.click(screen.getByText("trigger"));
        expect(screen.getByText("Hello")).toBeInTheDocument();
        expect(screen.getByText("Body text")).toBeInTheDocument();
    });

    it("confirm() shows a dialog, fires onConfirm and closes", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(
            <ModalsProvider>
                <Harness
                    onReady={(api) =>
                        api.confirm({
                            title: "Sure?",
                            message: "Delete it?",
                            onConfirm,
                        })
                    }
                />
            </ModalsProvider>,
        );
        await user.click(screen.getByText("trigger"));
        expect(screen.getByText("Delete it?")).toBeInTheDocument();
        await user.click(screen.getByText("Confirmar"));
        expect(onConfirm).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByText("Delete it?")).toBeNull());
    });

    it("confirm() cancel fires onCancel and closes", async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        render(
            <ModalsProvider>
                <Harness onReady={(api) => api.confirm({ message: "Remove?", onCancel })} />
            </ModalsProvider>,
        );
        await user.click(screen.getByText("trigger"));
        await user.click(screen.getByText("Cancelar"));
        expect(onCancel).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByText("Remove?")).toBeNull());
    });

    it("closeAll() clears the stack", async () => {
        const user = userEvent.setup();
        render(
            <ModalsProvider>
                <Harness
                    onReady={(api) => {
                        api.open({ children: "First" });
                        api.open({ children: "Second" });
                        api.closeAll();
                    }}
                />
            </ModalsProvider>,
        );
        await user.click(screen.getByText("trigger"));
        expect(screen.queryByText("First")).toBeNull();
        expect(screen.queryByText("Second")).toBeNull();
    });

    it("useModals throws outside a provider", () => {
        const Bad = () => {
            useModals();
            return null;
        };
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<Bad />)).toThrow(/ModalsProvider/);
        spy.mockRestore();
    });
});
