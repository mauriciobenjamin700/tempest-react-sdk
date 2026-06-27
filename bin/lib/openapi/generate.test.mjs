import { describe, it, expect } from "vitest";
import { generate } from "./generate.mjs";

const SPEC = {
    openapi: "3.1.0",
    components: {
        schemas: {
            User: {
                type: "object",
                required: ["id", "email"],
                properties: {
                    id: { type: "integer" },
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                },
            },
            UserCreate: {
                type: "object",
                required: ["email"],
                properties: {
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                },
            },
        },
    },
    paths: {
        "/users": {
            get: {
                tags: ["users"],
                operationId: "list_users",
                parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
                responses: { 200: { content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/User" } } } } } },
            },
            post: {
                tags: ["users"],
                operationId: "create_user",
                requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UserCreate" } } } },
                responses: { 201: { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
            },
        },
        "/users/{id}": {
            get: {
                tags: ["users"],
                operationId: "get_user",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
                responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
            },
        },
    },
};

describe("generate — FastAPI-style spec", () => {
    const { files, tags } = generate(SPEC);

    it("groups by tag", () => {
        expect(tags).toContain("users");
        expect(Object.keys(files)).toEqual(
            expect.arrayContaining([
                "users/schemas.ts",
                "users/types.ts",
                "users/service.ts",
                "users/index.ts",
                "index.ts",
            ]),
        );
    });

    it("emits Zod schemas for referenced models", () => {
        const s = files["users/schemas.ts"];
        expect(s).toContain('import { z } from "zod";');
        expect(s).toContain("export const UserSchema = z.object({");
        expect(s).toContain("export const UserCreateSchema = z.object({");
        expect(s).toContain('"email": z.string().email()');
    });

    it("emits inferred types", () => {
        const t = files["users/types.ts"];
        expect(t).toContain("export type User = z.infer<typeof S.UserSchema>;");
        expect(t).toContain("export type UserCreate = z.infer<typeof S.UserCreateSchema>;");
    });

    it("emits a service class with one method per route", () => {
        const svc = files["users/service.ts"];
        expect(svc).toContain("export class UsersService {");
        expect(svc).toContain("constructor(private readonly api: ApiClient) {}");
        // list with query params
        expect(svc).toMatch(/async listUsers\(params: \{ "limit"\?: number \}\): Promise<User\[\]>/);
        // create with Zod input validation
        expect(svc).toContain("S.UserCreateSchema.parse(body);");
        expect(svc).toMatch(/async createUser\(body: UserCreate\): Promise<User>/);
        // path param interpolation
        expect(svc).toMatch(/async getUser\(id: number\): Promise<User>/);
        expect(svc).toContain("return this.api.get<User>(`/users/${id}`);");
    });
});
