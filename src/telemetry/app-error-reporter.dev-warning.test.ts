import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDevBuild } from "../utils/dev-mode";
import { createAppErrorReporter, resetDropWithoutPrincipalWarning } from "./app-error-reporter";
import type { CreateAppErrorReporterOptions } from "./app-error-reporter";

vi.mock("../utils/dev-mode", () => ({ isDevBuild: vi.fn(() => true) }));

function build(extra: Partial<CreateAppErrorReporterOptions>): void {
    createAppErrorReporter({
        endpoint: "/api/app-errors",
        storage: null,
        autoFlush: false,
        fetch: vi.fn() as unknown as typeof fetch,
        ...extra,
    }).dispose();
}

describe("createAppErrorReporter — drop without getPrincipal", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetDropWithoutPrincipalWarning();
        vi.mocked(isDevBuild).mockReturnValue(true);
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it("warns once in development that drop needs getPrincipal and reports go out anonymously", () => {
        build({ foreignReports: "drop" });
        build({ foreignReports: "drop" });
        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0]?.[0]);
        expect(message).toContain("getPrincipal");
        expect(message).toContain('"drop"');
        expect(message).toContain("anonymously");
    });

    it("stays quiet when drop has its getPrincipal, or drop was not asked for", () => {
        build({ foreignReports: "drop", getPrincipal: () => "user-a" });
        build({ foreignReports: "anonymous" });
        build({});
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet in a production build", () => {
        vi.mocked(isDevBuild).mockReturnValue(false);
        build({ foreignReports: "drop" });
        expect(warn).not.toHaveBeenCalled();
    });
});
