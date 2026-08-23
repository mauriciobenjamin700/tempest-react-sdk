import { describe, expect, it } from "vitest";

import { toTooltipFormatter } from "./types";

describe("toTooltipFormatter", () => {
    it("gives recharts nothing when the caller formats nothing", () => {
        expect(toTooltipFormatter()).toBeUndefined();
    });

    it("coerces recharts' loose value into the number the caller's formatter wants", () => {
        const formatter = toTooltipFormatter((value) => `R$ ${value.toFixed(2)}`);

        expect(formatter?.("12.5" as never, "vendas" as never, {} as never, 0, [])).toBe(
            "R$ 12.50",
        );
    });
});
