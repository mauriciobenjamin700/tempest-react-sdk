import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventStream } from "./create-event-stream";

class EventSourceMock {
    static instances: EventSourceMock[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    closed = false;
    constructor(public url: string) {
        EventSourceMock.instances.push(this);
    }
    addEventListener(): void {}
    close(): void {
        this.closed = true;
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("createEventStream — URL resolved per connection", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        EventSourceMock.instances = [];
        vi.stubGlobal("EventSource", EventSourceMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("presents a fresh URL on the reconnect after the stream drops", async () => {
        let ticket = 0;
        const controller = createEventStream(
            () => {
                ticket += 1;
                return Promise.resolve(`/sse/stream?ticket=t${ticket}`);
            },
            { initialBackoff: 10 },
        );
        await flush();
        EventSourceMock.instances[0].onerror?.(new Event("error"));
        await vi.advanceTimersByTimeAsync(10);

        expect(EventSourceMock.instances.map((source) => source.url)).toEqual([
            "/sse/stream?ticket=t1",
            "/sse/stream?ticket=t2",
        ]);
        controller.close();
    });

    it("keeps a fixed string URL working as before, synchronously", () => {
        const controller = createEventStream("/sse");
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse"]);
        controller.close();
    });

    it("accepts a synchronous resolver", async () => {
        const controller = createEventStream(() => "/sse/sync");
        await flush();
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse/sync"]);
        controller.close();
    });

    it("reports connecting while the URL is still resolving", () => {
        const onStatusChange = vi.fn();
        const controller = createEventStream(() => new Promise<string>(() => {}), {
            onStatusChange,
        });
        expect(onStatusChange).toHaveBeenCalledWith("connecting");
        expect(controller.status).toBe("connecting");
        controller.close();
    });

    it("discards a resolution that settles after close()", async () => {
        let settle: (url: string) => void = () => {};
        const controller = createEventStream(
            () =>
                new Promise<string>((resolve) => {
                    settle = resolve;
                }),
        );
        controller.close();
        settle("/sse/late");
        await flush();
        expect(EventSourceMock.instances).toHaveLength(0);
        expect(controller.status).toBe("closed");
    });

    it("discards a resolution superseded by reconnect()", async () => {
        const pending: Array<(url: string) => void> = [];
        const controller = createEventStream(
            () =>
                new Promise<string>((resolve) => {
                    pending.push(resolve);
                }),
        );
        await flush();
        controller.reconnect();
        await flush();
        pending[0]("/sse/stale");
        pending[1]("/sse/current");
        await flush();
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse/current"]);
        controller.close();
    });

    it("reports a failed resolution and retries it by default", async () => {
        const onUrlError = vi.fn();
        const onError = vi.fn();
        const failure = new Error("offline");
        const resolver = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce("/sse/ok");
        const controller = createEventStream(resolver, {
            initialBackoff: 10,
            onUrlError,
            onError,
        });
        await flush();
        expect(onUrlError).toHaveBeenCalledWith(failure);
        expect(onError).not.toHaveBeenCalled();
        expect(controller.status).toBe("closed");

        await vi.advanceTimersByTimeAsync(10);
        expect(EventSourceMock.instances.map((source) => source.url)).toEqual(["/sse/ok"]);
        controller.close();
    });

    it("treats a resolver that throws synchronously like one that rejects", async () => {
        const onUrlError = vi.fn();
        const controller = createEventStream(
            () => {
                throw new Error("boom");
            },
            { onUrlError, maxRetries: 0 },
        );
        await flush();
        expect(onUrlError).toHaveBeenCalledOnce();
        expect(controller.status).toBe("error");
    });

    it("stops at error without retrying when shouldRetryUrl refuses", async () => {
        const resolver = vi.fn(() => Promise.reject(new Error("forbidden")));
        const controller = createEventStream(resolver, {
            initialBackoff: 10,
            shouldRetryUrl: () => false,
        });
        await flush();
        await vi.advanceTimersByTimeAsync(1000);
        expect(resolver).toHaveBeenCalledOnce();
        expect(controller.status).toBe("error");
        expect(EventSourceMock.instances).toHaveLength(0);
    });

    it("counts resolution failures against maxRetries", async () => {
        const resolver = vi.fn(() => Promise.reject(new Error("down")));
        const controller = createEventStream(resolver, { initialBackoff: 1, maxRetries: 2 });
        await vi.advanceTimersByTimeAsync(100);
        expect(resolver).toHaveBeenCalledTimes(3);
        expect(controller.status).toBe("error");
    });
});
