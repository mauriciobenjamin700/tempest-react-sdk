import { describe, expect, it } from "vitest";
import {
    APP_ERROR_CODE_MAX_LENGTH,
    APP_ERROR_MESSAGE_MAX_LENGTH,
    APP_ERROR_TEXT_FIELD_MAX_LENGTH,
    APP_ERROR_TRUNCATION_SUFFIX,
    fitAppErrorReport,
    truncateAppErrorText,
} from "./app-error-schema";

describe("app-error schema limits", () => {
    it("pins the limits ported from tempest-fastapi-sdk, so upstream drift fails here", () => {
        expect(APP_ERROR_CODE_MAX_LENGTH).toBe(120);
        expect(APP_ERROR_MESSAGE_MAX_LENGTH).toBe(4000);
        expect(APP_ERROR_TEXT_FIELD_MAX_LENGTH).toBe(200);
        expect(APP_ERROR_TRUNCATION_SUFFIX).toBe("…[truncado]");
    });

    it("leaves text that fits untouched", () => {
        expect(truncateAppErrorText("short", 10)).toBe("short");
    });

    it("cuts text over the limit to exactly the limit, ending in the server's suffix", () => {
        const cut = truncateAppErrorText("x".repeat(50), 20);
        expect(cut).toHaveLength(20);
        expect(cut.endsWith(APP_ERROR_TRUNCATION_SUFFIX)).toBe(true);
    });

    it("never exceeds a limit shorter than the suffix itself", () => {
        expect(truncateAppErrorText("abcdefghijklmnop", 4)).toHaveLength(4);
    });

    it("fits code, message and every device text field, and leaves absent ones absent", () => {
        const fitted = fitAppErrorReport({
            code: "c".repeat(500),
            message: "m".repeat(9000),
            app_version: "v".repeat(300),
            platform: "web",
        });
        expect(fitted.code).toHaveLength(APP_ERROR_CODE_MAX_LENGTH);
        expect(fitted.message).toHaveLength(APP_ERROR_MESSAGE_MAX_LENGTH);
        expect(fitted.app_version).toHaveLength(APP_ERROR_TEXT_FIELD_MAX_LENGTH);
        expect(fitted.platform).toBe("web");
        expect("device_id" in fitted).toBe(false);
    });
});
