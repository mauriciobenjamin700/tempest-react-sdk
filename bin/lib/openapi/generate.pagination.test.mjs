import { describe, it, expect } from "vitest";

import { generate } from "./generate.mjs";

const SPEC = {
    openapi: "3.1.0",
    components: {
        schemas: {
            Post: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "integer" }, title: { type: "string" } },
            },
            PostPage: {
                type: "object",
                properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Post" } },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    page_size: { type: "integer" },
                    pages: { type: "integer" },
                },
            },
            PostFeed: {
                type: "object",
                properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Post" } },
                    next_cursor: { type: "string", nullable: true },
                    has_more: { type: "boolean" },
                    limit: { type: "integer" },
                },
            },
        },
    },
    paths: {
        "/posts": {
            get: {
                tags: ["posts"],
                operationId: "list_posts",
                responses: {
                    200: {
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/PostPage" },
                            },
                        },
                    },
                },
            },
        },
        "/posts/feed": {
            get: {
                tags: ["posts"],
                operationId: "feed_posts",
                responses: {
                    200: {
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/PostFeed" },
                            },
                        },
                    },
                },
            },
        },
    },
};

describe("generate — pagination envelopes", () => {
    const { files } = generate(SPEC);
    const svc = files["posts/service.ts"];

    it("maps the offset envelope to OffsetPage<Post>", () => {
        expect(svc).toMatch(/async listPosts\(\): Promise<OffsetPage<Post>>/);
    });

    it("maps the cursor envelope to CursorPage<Post>", () => {
        expect(svc).toMatch(/async feedPosts\(\): Promise<CursorPage<Post>>/);
    });

    it("imports the page types from the SDK", () => {
        expect(svc).toContain(
            'import type { ApiClient, OffsetPage, CursorPage } from "tempest-react-sdk";',
        );
    });
});
