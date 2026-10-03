/**
 * The client platform an error was reported from.
 *
 * The closed set the backend filters on, mirrored from `tempest-fastapi-sdk`'s
 * `AppPlatform`: an error that only shows up on iOS is not the same bug as one
 * that only shows up on Android, and a PWA reports `"web"`.
 */
export type AppErrorPlatform = "ios" | "android" | "web" | "unknown";

/**
 * Device data travelling with a report — the wire shape of
 * `tempest-fastapi-sdk`'s `AppErrorDeviceSchema`, snake_case included.
 *
 * Every field is optional on purpose: the app sends whatever it managed to
 * collect at the moment of the failure, and requiring any of them would turn an
 * incomplete collection into a lost report.
 */
export interface AppErrorDeviceSchema {
    /** Reporting client's platform. The backend stores `"unknown"` when absent. */
    platform?: AppErrorPlatform;
    /** Operating system version, e.g. `"Android 14"`. */
    os_version?: string;
    /** Application version or build — with `code`, the cut that isolates one defect. */
    app_version?: string;
    /** Device model, e.g. `"SM-A105M"`. */
    device_model?: string;
    /** Anonymous device identifier, used to group reports from one device. */
    device_id?: string;
}

/**
 * The body of `POST /api/app-errors` — `tempest-fastapi-sdk`'s
 * `AppErrorReportSchema`. There is deliberately no `user_id`: the backend takes
 * it from the bearer token, never from the body, so a client cannot attribute a
 * report to somebody else.
 */
export interface AppErrorReportSchema extends AppErrorDeviceSchema {
    /** Stable error identifier — the first thing anyone groups by. */
    code: string;
    /** Message, cause chain, context and stack, as one text. */
    message: string;
}

/**
 * Longest `code` the backend column holds.
 *
 * Ported from tempest-fastapi-sdk's `APP_ERROR_CODE_MAX_LENGTH`.
 */
export const APP_ERROR_CODE_MAX_LENGTH = 120;

/**
 * Longest `message` the backend keeps.
 *
 * Ported from tempest-fastapi-sdk's `APP_ERROR_MESSAGE_MAX_LENGTH`. The server
 * truncates on its own; cutting here too is what keeps a queue of fifty stack
 * traces from filling `localStorage` while the device is offline.
 */
export const APP_ERROR_MESSAGE_MAX_LENGTH = 4000;

/**
 * Longest device text field (`os_version`, `app_version`, …) the backend holds.
 *
 * Ported from tempest-fastapi-sdk's `APP_ERROR_TEXT_FIELD_MAX_LENGTH`.
 */
export const APP_ERROR_TEXT_FIELD_MAX_LENGTH = 200;

/**
 * Marker appended where a value was cut.
 *
 * Ported from tempest-fastapi-sdk's `APP_ERROR_TRUNCATION_SUFFIX`, so a report
 * cut on the device reads exactly like one cut by the server.
 */
export const APP_ERROR_TRUNCATION_SUFFIX = "…[truncado]";

/**
 * Shorten `value` to `limit` characters, marking the cut.
 *
 * Same rule as the backend's `AppErrorService.truncate`: shortened, never
 * refused, because the sender has just failed and has no way to handle a
 * rejection.
 *
 * @param value - The text to fit.
 * @param limit - Maximum length, suffix included.
 * @returns `value` unchanged when it fits, the cut version with the suffix otherwise.
 */
export function truncateAppErrorText(value: string, limit: number): string {
    if (value.length <= limit) return value;
    const keep = Math.max(limit - APP_ERROR_TRUNCATION_SUFFIX.length, 0);
    return `${value.slice(0, keep)}${APP_ERROR_TRUNCATION_SUFFIX}`.slice(0, limit);
}

const DEVICE_TEXT_FIELDS = ["os_version", "app_version", "device_model", "device_id"] as const;

/**
 * Fit every field of a report to the backend's column limits.
 *
 * @param report - The report as built.
 * @returns A copy with `code`, `message` and the device text fields truncated.
 */
export function fitAppErrorReport(report: AppErrorReportSchema): AppErrorReportSchema {
    const fitted: AppErrorReportSchema = {
        ...report,
        code: truncateAppErrorText(report.code, APP_ERROR_CODE_MAX_LENGTH),
        message: truncateAppErrorText(report.message, APP_ERROR_MESSAGE_MAX_LENGTH),
    };
    for (const field of DEVICE_TEXT_FIELDS) {
        const value = fitted[field];
        if (value !== undefined) {
            fitted[field] = truncateAppErrorText(value, APP_ERROR_TEXT_FIELD_MAX_LENGTH);
        }
    }
    return fitted;
}
