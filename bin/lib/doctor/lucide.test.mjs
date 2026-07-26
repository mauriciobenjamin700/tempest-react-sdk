import { describe, expect, it } from "vitest";

import { checkLucide } from "./lucide.mjs";

/** The healthy shape: the SDK brings lucide, the app declares nothing. */
const CLEAN = {
    appSpec: null,
    sdkSpec: "^1.26.0",
    installedVersion: "1.26.0",
    nestedCopy: false,
};

/** Statuses of the returned rows, in order. */
const statuses = (rows) => rows.map(([status]) => status);

/** All detail text joined, for asserting the advice is actually present. */
const details = (rows) => rows.map(([, , detail]) => detail ?? "").join(" ");

describe("checkLucide — nothing to audit", () => {
    it("returns no rows when the SDK does not declare lucide", () => {
        expect(checkLucide({ ...CLEAN, sdkSpec: null })).toEqual([]);
    });

    it("stays silent even if the app declares it, with no SDK to compare against", () => {
        expect(checkLucide({ ...CLEAN, sdkSpec: null, appSpec: "^1.0.0" })).toEqual([]);
    });
});

describe("checkLucide — healthy", () => {
    it("reports a single instance and names where it came from", () => {
        const rows = checkLucide(CLEAN);
        expect(statuses(rows)).toEqual(["ok"]);
        expect(rows[0][1]).toBe("single lucide-react instance");
        expect(rows[0][2]).toContain("^1.26.0");
    });

    it("stays ok when the installed version is newer than required", () => {
        expect(statuses(checkLucide({ ...CLEAN, installedVersion: "2.4.0" }))).toEqual(["ok"]);
    });

    it("stays ok when the version cannot be resolved at all", () => {
        expect(statuses(checkLucide({ ...CLEAN, installedVersion: null }))).toEqual(["ok"]);
    });
});

describe("checkLucide — the app declares it too", () => {
    it("warns and says to uninstall when the range differs from the SDK's", () => {
        const rows = checkLucide({ ...CLEAN, appSpec: "^0.575.0" });
        expect(statuses(rows)).toEqual(["warn"]);
        expect(details(rows)).toContain("npm uninstall lucide-react");
        expect(details(rows)).toContain("^0.575.0");
        expect(details(rows)).toContain("^1.26.0");
    });

    it("mentions pnpm, the one case where declaring it is correct", () => {
        expect(details(checkLucide({ ...CLEAN, appSpec: "^0.575.0" }))).toContain("pnpm");
    });

    it("downgrades to info when the range matches — redundant, not broken", () => {
        const rows = checkLucide({ ...CLEAN, appSpec: "^1.26.0" });
        expect(statuses(rows)).toEqual(["info"]);
        expect(details(rows)).toContain("redundant");
    });
});

describe("checkLucide — a second physical copy", () => {
    it("warns about the nested copy and points at both remedies", () => {
        const rows = checkLucide({ ...CLEAN, nestedCopy: true });
        expect(statuses(rows)).toEqual(["warn"]);
        expect(rows[0][1]).toBe("two copies of lucide-react");
        expect(details(rows)).toContain("npm dedupe");
        expect(details(rows)).toContain("the SDK ships it");
    });

    it("reports the nested copy and the declaration as separate rows", () => {
        const rows = checkLucide({ ...CLEAN, nestedCopy: true, appSpec: "^0.575.0" });
        expect(statuses(rows)).toEqual(["warn", "warn"]);
    });
});

describe("checkLucide — version older than the generated tables need", () => {
    it("fails, because this one breaks the build rather than wasting bytes", () => {
        const rows = checkLucide({ ...CLEAN, installedVersion: "0.575.0" });
        expect(statuses(rows)).toEqual(["fail"]);
        expect(rows[0][1]).toContain("0.575.0");
        expect(details(rows)).toContain("is not exported by");
    });

    it("explains that the error surfaces inside the SDK, not in app code", () => {
        expect(details(checkLucide({ ...CLEAN, installedVersion: "0.575.0" }))).toContain(
            "inside the SDK",
        );
    });

    it("reports the skew alongside the declaration that caused it", () => {
        const rows = checkLucide({
            ...CLEAN,
            appSpec: "^0.575.0",
            installedVersion: "0.575.0",
        });
        expect(statuses(rows)).toEqual(["warn", "fail"]);
    });

    it("does not fail on a malformed version string", () => {
        expect(statuses(checkLucide({ ...CLEAN, installedVersion: "latest" }))).toEqual(["ok"]);
    });
});
