import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table } from "./Table";

interface Row {
    id: string;
    name: string;
    email: string;
}

const data: Row[] = [{ id: "1", name: "Maria", email: "maria@x.com" }];

describe("Table — priority + stackOnMobile", () => {
    it("applies priority class to columns", () => {
        const { container } = render(
            <Table<Row>
                columns={[
                    { key: "name", header: "Nome" },
                    { key: "email", header: "Email", priority: "tablet" },
                ]}
                data={data}
                rowKey={(r) => r.id}
            />,
        );
        const ths = container.querySelectorAll("th");
        expect(ths[0].className).not.toContain("priorityTablet");
        expect(ths[1].className).toContain("priorityTablet");
    });

    it("stackOnMobile adds data-label on td and stackable class", () => {
        const { container } = render(
            <Table<Row>
                stackOnMobile
                columns={[
                    { key: "name", header: "Nome" },
                    { key: "email", header: "Email" },
                ]}
                data={data}
                rowKey={(r) => r.id}
            />,
        );
        const tds = container.querySelectorAll("td");
        expect(tds[0].getAttribute("data-label")).toBe("Nome");
        expect(tds[1].getAttribute("data-label")).toBe("Email");
        expect(screen.getByRole("table").parentElement?.className).toContain("stackable");
    });
});
