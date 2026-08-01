/**
 * Errors thrown by the imaging module.
 *
 * `name` is a literal string on every subclass: minifiers rename classes,
 * and a derived `new.target.name` ships as `error.name === "t"`.
 */

/** Base class for every error this module throws. */
export class ImagingError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ImagingError";
    }
}

/** The source could not be decoded into pixels. */
export class ImageDecodeError extends ImagingError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ImageDecodeError";
    }
}

/** The canvas could not produce encoded bytes. */
export class ImageEncodeError extends ImagingError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ImageEncodeError";
    }
}

/**
 * The browser cannot encode the requested format.
 *
 * Worth its own class because the failure is otherwise silent: asking a
 * canvas for an unsupported type does not throw — it hands back a PNG,
 * and an app that trusted the request ships 4 MB where it expected 300 KB.
 */
export class UnsupportedImageTypeError extends ImagingError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "UnsupportedImageTypeError";
    }
}

/** The environment has no canvas to draw on. */
export class ImagingUnavailableError extends ImagingError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ImagingUnavailableError";
    }
}
