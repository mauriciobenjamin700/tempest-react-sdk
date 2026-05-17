import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, it } from "vitest";
import { QueryProvider } from "./QueryProvider";

function Sample() {
    const query = useQuery({ queryKey: ["x"], queryFn: () => Promise.resolve("ok") });
    return <span>{query.data ?? "loading"}</span>;
}

describe("QueryProvider", () => {
    it("wraps children with QueryClient", async () => {
        render(
            <QueryProvider>
                <Sample />
            </QueryProvider>,
        );
        await screen.findByText("ok");
    });
});
