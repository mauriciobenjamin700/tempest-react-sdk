/**
 * Lightweight, MSW-shaped mock request handler factory. Returns plain
 * objects with `{ method, path, status, body }` that callers feed into
 * `msw`'s `http.<method>` helpers OR a custom test harness — the SDK
 * does **not** declare `msw` as a peer dep, so this helper is purely
 * data-driven.
 *
 * Use cases:
 * - Define request fixtures in a single file, share between tests and
 *   Storybook stories (when used).
 * - Standardise the "happy path" + "error path" shape across services.
 *
 * @example
 * import { http, HttpResponse } from "msw";
 * import { setupServer } from "msw/node";
 * import { createMockHandlers } from "tempest-react-sdk/testing";
 *
 * const fixtures = createMockHandlers([
 *     { method: "GET", path: "/users/me", status: 200, body: { id: "u1", name: "Mauricio" } },
 *     { method: "POST", path: "/orders", status: 201, body: { id: "o1" } },
 *     { method: "GET", path: "/explode", status: 500, body: { detail: "kaboom" } },
 * ]);
 *
 * const handlers = fixtures.map((f) =>
 *     (http as Record<string, Function>)[f.method.toLowerCase()](f.path, () =>
 *         HttpResponse.json(f.body, { status: f.status }),
 *     ),
 * );
 *
 * setupServer(...handlers);
 */

export type MockHandlerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockHandlerInput {
    method: MockHandlerMethod;
    path: string;
    /** HTTP status code. Default `200`. */
    status?: number;
    /** Response body — anything JSON-serialisable. Default `null`. */
    body?: unknown;
    /** Optional response headers. */
    headers?: Record<string, string>;
    /** Optional artificial delay in ms. Useful to test loading states. */
    delayMs?: number;
}

export interface MockHandler {
    method: MockHandlerMethod;
    path: string;
    status: number;
    body: unknown;
    headers: Record<string, string>;
    delayMs: number;
}

/**
 * Normalise a list of request fixtures into MSW-friendly handler descriptors.
 * Default `status` is `200`, default `body` is `null`, default `delayMs` is `0`,
 * default `headers` is `{ "Content-Type": "application/json" }`.
 */
export function createMockHandlers(handlers: MockHandlerInput[]): MockHandler[] {
    return handlers.map((handler) => ({
        method: handler.method,
        path: handler.path,
        status: handler.status ?? 200,
        body: handler.body ?? null,
        headers: handler.headers ?? { "Content-Type": "application/json" },
        delayMs: handler.delayMs ?? 0,
    }));
}
