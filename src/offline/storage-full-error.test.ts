import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { isQuotaExceededError, StorageFullError } from "./storage-full-error";

type DexieErrorConstructor = new (message?: unknown, inner?: unknown) => Error;

const dexieErrors = Dexie as unknown as {
    AbortError: DexieErrorConstructor;
    QuotaExceededError: DexieErrorConstructor;
    ConstraintError: DexieErrorConstructor;
    BulkError: new (message: string, failures: Record<number, Error>) => Error;
    ModifyError: new (
        message: string,
        failures: Error[],
        successCount: number,
        failedKeys: unknown[],
    ) => Error;
};

function browserQuota(): DOMException {
    return new DOMException("quota", "QuotaExceededError");
}

describe("StorageFullError", () => {
    it("is an Error named StorageFullError that keeps the original as cause", () => {
        const original = browserQuota();
        const error = new StorageFullError(original);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("StorageFullError");
        expect(error.cause).toBe(original);
        expect(error.message).toBe("O armazenamento do navegador está cheio.");
    });
});

describe("isQuotaExceededError", () => {
    it.each<[string, unknown]>([
        ["the browser's DOMException", browserQuota()],
        [
            "Firefox's legacy NS_ERROR_DOM_QUOTA_REACHED",
            new DOMException("q", "NS_ERROR_DOM_QUOTA_REACHED"),
        ],
        ["Dexie's QuotaExceededError", new dexieErrors.QuotaExceededError("q", browserQuota())],
        [
            "Dexie's AbortError wrapping the quota (Chromium at commit)",
            new dexieErrors.AbortError(browserQuota()),
        ],
        [
            "Dexie's BulkError with a quota failure",
            new dexieErrors.BulkError("bulk", { 1: new dexieErrors.QuotaExceededError("q") }),
        ],
        [
            "Dexie's ModifyError with a quota failure",
            new dexieErrors.ModifyError("modify", [browserQuota()], 0, ["k"]),
        ],
        ["an error whose cause is the quota", new Error("wrapped", { cause: browserQuota() })],
        ["a StorageFullError", new StorageFullError(browserQuota())],
    ])("recognises %s", (_name, error) => {
        expect(isQuotaExceededError(error)).toBe(true);
    });

    it.each<[string, unknown]>([
        ["a plain AbortError (transaction aborted by the app)", new dexieErrors.AbortError()],
        ["a ConstraintError", new dexieErrors.ConstraintError("dup")],
        [
            "a BulkError of constraint failures",
            new dexieErrors.BulkError("bulk", { 0: new dexieErrors.ConstraintError("dup") }),
        ],
        ["a TypeError", new TypeError("x")],
        ["a string", "QuotaExceededError"],
        ["null", null],
        ["undefined", undefined],
    ])("rejects %s", (_name, error) => {
        expect(isQuotaExceededError(error)).toBe(false);
    });

    it("terminates on an error that wraps itself", () => {
        const error = new Error("loop") as Error & { inner?: unknown };
        error.inner = error;
        expect(isQuotaExceededError(error)).toBe(false);
    });
});
