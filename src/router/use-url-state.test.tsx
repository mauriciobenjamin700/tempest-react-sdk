import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigationType, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";

import { DataTable } from "../components/DataTable";
import { useUrlState } from "./use-url-state";

const DEFAULTS = { busca: "", pagina: 1, por_pagina: 20, ativos: false };

function routerAt(url: string) {
    return ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    );
}

function useProbe() {
    const url = useUrlState(DEFAULTS);
    const location = useLocation();
    const navigationType = useNavigationType();
    return { ...url, search: location.search, navigationType };
}

describe("useUrlState", () => {
    it("parses each parameter by the type of its default", () => {
        const { result } = renderHook(() => useUrlState(DEFAULTS), {
            wrapper: routerAt("/?busca=caf%C3%A9&pagina=3&ativos=true"),
        });
        expect(result.current.state).toEqual({
            busca: "café",
            pagina: 3,
            por_pagina: 20,
            ativos: true,
        });
    });

    it("falls back to the default for a value that does not parse, instead of throwing", () => {
        const { result } = renderHook(() => useUrlState(DEFAULTS), {
            wrapper: routerAt("/?pagina=abc&por_pagina=&ativos=talvez"),
        });
        expect(result.current.state).toEqual(DEFAULTS);
    });

    it("removes a parameter set to its default or to null, so a clean screen is a bare path", async () => {
        const { result } = renderHook(useProbe, { wrapper: routerAt("/?busca=x&pagina=4") });
        await act(async () => result.current.set({ busca: null, pagina: 1 }));
        expect(result.current.search).toBe("");
    });

    it("keeps two writes of the same tick — the race react-router's setSearchParams loses", async () => {
        const raw = renderHook(
            () => {
                const [, setSearchParams] = useSearchParams();
                return { setSearchParams, search: useLocation().search };
            },
            { wrapper: routerAt("/?pagina=3") },
        );
        act(() => {
            raw.result.current.setSearchParams((params) => {
                params.set("por_pagina", "50");
                return params;
            });
            raw.result.current.setSearchParams((params) => {
                params.set("pagina", "1");
                return params;
            });
        });
        expect(raw.result.current.search).toBe("?pagina=1");

        const { result } = renderHook(useProbe, { wrapper: routerAt("/?pagina=3") });
        await act(async () => {
            result.current.set({ por_pagina: 50 });
            result.current.set({ pagina: 1 });
        });
        expect(result.current.search).toBe("?por_pagina=50");
    });

    it("lands one gesture as one navigation, pushing unless every write asked to replace", async () => {
        const { result } = renderHook(useProbe, { wrapper: routerAt("/") });
        await act(async () => {
            result.current.set({ busca: "a" }, { replace: true });
            result.current.set({ pagina: 2 });
        });
        expect(result.current.navigationType).toBe("PUSH");

        await act(async () => result.current.set({ busca: "ab" }, { replace: true }));
        expect(result.current.navigationType).toBe("REPLACE");
        expect(result.current.search).toBe("?busca=ab&pagina=2");
    });

    it("leaves parameters it does not know alone", async () => {
        const { result } = renderHook(useProbe, { wrapper: routerAt("/?aba=detalhes") });
        await act(async () => result.current.set({ pagina: 2 }));
        expect(result.current.search).toBe("?aba=detalhes&pagina=2");
    });

    it("reset removes the named keys, or every key it knows", async () => {
        const { result } = renderHook(useProbe, {
            wrapper: routerAt("/?busca=x&pagina=3&aba=1"),
        });
        await act(async () => result.current.reset(["pagina"]));
        expect(result.current.search).toBe("?busca=x&aba=1");
        await act(async () => result.current.reset());
        expect(result.current.search).toBe("?aba=1");
    });

    it("does not navigate when a write changes nothing", async () => {
        const { result } = renderHook(useProbe, { wrapper: routerAt("/?pagina=2") });
        await act(async () => result.current.set({ pagina: 2 }));
        expect(result.current.navigationType).toBe("POP");
    });

    it("keeps the page size when DataTable reports size and page in one click (#714)", async () => {
        let search = "";
        function Screen() {
            const { state, set } = useUrlState(DEFAULTS);
            search = useLocation().search;
            const rows = Array.from({ length: 10 }, (_, id) => ({ id }));
            return (
                <DataTable
                    data={rows}
                    columns={[{ key: "id", header: "Id" }]}
                    rowKey={(row) => row.id}
                    totalItems={200}
                    page={state.pagina}
                    onPageChange={(pagina) => set({ pagina })}
                    pageSize={state.por_pagina}
                    pageSizeOptions={[20, 50]}
                    onPageSizeChange={(por_pagina) => set({ por_pagina })}
                />
            );
        }
        render(
            <MemoryRouter initialEntries={["/?pagina=3"]}>
                <Screen />
            </MemoryRouter>,
        );
        await userEvent.selectOptions(screen.getByRole("combobox"), "50");
        expect(search).toBe("?por_pagina=50");
    });
});
