import { describe, expect, it } from "vitest";

import { DataTable, type DataTableColumn } from "./DataTable";

type Row = { id: number; name: string };

const columns: DataTableColumn<Row>[] = [{ key: "name", header: "Name" }];
const data: Row[] = [{ id: 1, name: "Ana" }];

/**
 * The props are a union of the shapes that actually work, and this file is the
 * assertion that they are.
 *
 * Every `@ts-expect-error` below is a combination that used to compile and then
 * rendered a table which lies — a pager that moves nothing, a header whose arrow
 * turns while the rows stay put. They were diagnosed with `console.warn`, in dev,
 * in the browser, with the component mounted; a consumer's `tsc` never saw them.
 * The compile step is now the check, so these lines failing to error is itself the
 * regression: `tsc` runs over the test suite in this repo, so a widened type
 * breaks the build here.
 *
 * The runtime warnings stay for the callers types cannot reach — plain
 * JavaScript, or props arriving through an `any`-typed spread.
 */
describe("DataTableProps", () => {
    it("accepts a client-mode table with no paging props", () => {
        expect(<DataTable data={data} columns={columns} />).toBeTruthy();
    });

    it("accepts a controlled page paired with its callback", () => {
        expect(
            <DataTable data={data} columns={columns} page={1} onPageChange={() => {}} />,
        ).toBeTruthy();
    });

    it("accepts server mode with the full trio", () => {
        expect(
            <DataTable
                data={data}
                columns={columns}
                totalItems={40}
                page={1}
                onPageChange={() => {}}
            />,
        ).toBeTruthy();
    });

    it("accepts delegated sorting paired with its callback", () => {
        expect(
            <DataTable data={data} columns={columns} manualSort onSortChange={() => {}} />,
        ).toBeTruthy();
    });

    it("rejects server mode without a controlled page", () => {
        // @ts-expect-error totalItems requires page and onPageChange
        expect(<DataTable data={data} columns={columns} totalItems={40} />).toBeTruthy();
    });

    it("rejects a controlled page with nowhere to report it", () => {
        // @ts-expect-error page requires onPageChange
        expect(<DataTable data={data} columns={columns} page={1} />).toBeTruthy();
    });

    it("rejects delegated sorting with nowhere to report it", () => {
        // @ts-expect-error manualSort requires onSortChange
        expect(<DataTable data={data} columns={columns} manualSort />).toBeTruthy();
    });

    it("rejects server mode that names a page but no way to change it", () => {
        // @ts-expect-error totalItems + page still require onPageChange
        expect(<DataTable data={data} columns={columns} totalItems={40} page={1} />).toBeTruthy();
    });
});
