import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BarList } from "./BarList";
import { buildBarListRows } from "./bar-list-model";

const PLANS = [
    { label: "Free", value: 128 },
    { label: "Pro", value: 32 },
    { label: "Team", value: 16 },
    { label: "Enterprise", value: 8 },
    { label: "Legacy", value: 4 },
];

const labels = (): string[] =>
    screen.getAllByRole("listitem").map((item) => item.textContent ?? "");

const fillWidth = (index: number): string => {
    const item = screen.getAllByRole("listitem")[index];
    const fill = item?.querySelector("div > div") as HTMLElement | null;
    return fill?.style.width ?? "";
};

describe("BarList", () => {
    it("renders one list item per row", () => {
        render(<BarList items={PLANS.slice(0, 2)} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("ranks descending by default", () => {
        render(
            <BarList
                items={[
                    { label: "a", value: 1 },
                    { label: "b", value: 9 },
                ]}
            />,
        );
        expect(labels()[0]).toContain("b");
    });

    it("ranks ascending on request", () => {
        render(
            <BarList
                items={[
                    { label: "a", value: 9 },
                    { label: "b", value: 1 },
                ]}
                sort="asc"
            />,
        );
        expect(labels()[0]).toContain("b");
    });

    it("keeps the given order with sort=none", () => {
        render(
            <BarList
                items={[
                    { label: "a", value: 1 },
                    { label: "b", value: 9 },
                ]}
                sort="none"
            />,
        );
        expect(labels()[0]).toContain("a");
    });

    it("writes the value as text, so a screen reader reads it", () => {
        render(<BarList items={[{ label: "Free", value: 128 }]} />);
        const item = screen.getByRole("listitem");
        expect(within(item).getByText("Free")).toBeInTheDocument();
        expect(item.textContent).toContain("128");
    });

    it("formats the value when asked", () => {
        render(
            <BarList
                items={[{ label: "Free", value: 128 }]}
                valueFormatter={(n) => `${n} ativos`}
            />,
        );
        expect(screen.getByText("128 ativos")).toBeInTheDocument();
    });

    it("shows the share of the total, not of the largest row", () => {
        render(
            <BarList
                items={[
                    { label: "a", value: 75 },
                    { label: "b", value: 25 },
                ]}
                showPercentage
            />,
        );
        expect(screen.getByText("75%")).toBeInTheDocument();
        expect(screen.getByText("25%")).toBeInTheDocument();
    });

    it("hides the share unless asked", () => {
        render(<BarList items={[{ label: "a", value: 75 }]} />);
        expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });

    it("scales the widest bar to the full track", () => {
        render(
            <BarList
                items={[
                    { label: "a", value: 75 },
                    { label: "b", value: 25 },
                ]}
            />,
        );
        expect(fillWidth(0)).toBe("100%");
        expect(fillWidth(1)).toBe("33.33333333333333%");
    });

    it("keeps the bars out of the accessibility tree", () => {
        render(<BarList items={[{ label: "a", value: 1 }]} />);
        const track = screen.getByRole("listitem").querySelector("[aria-hidden='true']");
        expect(track).not.toBeNull();
    });

    it("honours a per-item colour override", () => {
        render(<BarList items={[{ label: "a", value: 1, color: "#ff0000" }]} />);
        const item = screen.getAllByRole("listitem")[0];
        const fill = item?.querySelector("div > div") as HTMLElement;
        expect(fill.style.backgroundColor).toBe("rgb(255, 0, 0)");
    });
});

describe("BarList — truncation", () => {
    it("keeps only the top N", () => {
        render(<BarList items={PLANS} max={3} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("aggregates the rest into one row when a label is given", () => {
        render(<BarList items={PLANS} max={3} otherLabel="Outros" />);
        const rows = labels();
        expect(rows).toHaveLength(4);
        expect(rows[3]).toContain("Outros");
        expect(rows[3]).toContain("12");
    });

    it("shows a single leftover row by name instead of calling it 'others'", () => {
        render(<BarList items={PLANS.slice(0, 4)} max={3} otherLabel="Outros" />);
        const rows = labels();
        expect(rows).toHaveLength(4);
        expect(rows[3]).toContain("Enterprise");
    });

    it("ignores max when it is zero or negative", () => {
        render(<BarList items={PLANS} max={0} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });
});

describe("buildBarListRows", () => {
    it("returns nothing for an empty list", () => {
        expect(buildBarListRows({ items: [] })).toEqual([]);
    });

    it("reports 0% instead of NaN when everything is zero", () => {
        const rows = buildBarListRows({
            items: [
                { label: "a", value: 0 },
                { label: "b", value: 0 },
            ],
            sort: "desc",
        });
        expect(rows.map((row) => row.percentage)).toEqual([0, 0]);
        expect(rows.map((row) => row.width)).toEqual([0, 0]);
    });

    it("draws no bar for a negative value but keeps the row", () => {
        const rows = buildBarListRows({
            items: [
                { label: "a", value: 10 },
                { label: "b", value: -4 },
            ],
            sort: "desc",
        });
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ label: "b", value: -4, width: 0, percentage: 0 });
    });

    it("excludes negatives from the total, so shares still add up", () => {
        const rows = buildBarListRows({
            items: [
                { label: "a", value: 30 },
                { label: "b", value: 10 },
                { label: "c", value: -5 },
            ],
            sort: "desc",
        });
        expect(rows[0]?.percentage).toBe(75);
        expect(rows[1]?.percentage).toBe(25);
    });

    it("drops entries whose value is not finite", () => {
        const rows = buildBarListRows({
            items: [
                { label: "a", value: Number.NaN },
                { label: "b", value: 5 },
                { label: "c", value: Number.POSITIVE_INFINITY },
            ],
            sort: "desc",
        });
        expect(rows.map((row) => row.label)).toEqual(["b"]);
    });

    it("numbers the rows in render order, which is what the palette cycles on", () => {
        const items = Array.from({ length: 10 }, (_, index) => ({
            label: `s${index}`,
            value: 10 - index,
        }));
        const rows = buildBarListRows({ items, sort: "desc" });
        expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
});

const series = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ label: `s${index}`, value: count - index }));

const fillColor = (index: number): string => {
    const item = screen.getAllByRole("listitem")[index];
    const fill = item?.querySelector("div > div") as HTMLElement;
    return fill.style.backgroundColor;
};

/**
 * The bug this covers is invisible in the default theme.
 *
 * With all eight `--tempest-chart-*` slots set, cycling on a hardcoded `8` and
 * cycling on the declared count give the same answer — so nothing looks wrong
 * until a brand declares fewer series, and then rows seven and eight quietly
 * come back in the SDK's own blue and teal. `--tempest-chart-count` exists to
 * prevent exactly that, and `BarList` was the first reader of the ramp that
 * ignored it.
 */
describe("BarList — palette", () => {
    afterEach(() => {
        document.documentElement.style.removeProperty("--tempest-chart-count");
        for (let index = 1; index <= 8; index += 1) {
            document.documentElement.style.removeProperty(`--tempest-chart-${index}`);
        }
    });

    it("cycles within a brand palette smaller than the eight slots", () => {
        const brand = ["#111111", "#222222", "#333333"];
        brand.forEach((value, index) => {
            document.documentElement.style.setProperty(`--tempest-chart-${index + 1}`, value);
        });
        document.documentElement.style.setProperty("--tempest-chart-count", "3");

        render(<BarList items={series(5)} />);

        expect(fillColor(0)).toBe("rgb(17, 17, 17)");
        expect(fillColor(2)).toBe("rgb(51, 51, 51)");
        expect(fillColor(3)).toBe("rgb(17, 17, 17)");
        expect(fillColor(4)).toBe("rgb(34, 34, 34)");
    });

    it("still lets a per-item colour win over the palette", () => {
        document.documentElement.style.setProperty("--tempest-chart-1", "#111111");
        document.documentElement.style.setProperty("--tempest-chart-count", "1");

        render(<BarList items={[{ label: "a", value: 1, color: "#ff0000" }]} />);

        expect(fillColor(0)).toBe("rgb(255, 0, 0)");
    });
});
