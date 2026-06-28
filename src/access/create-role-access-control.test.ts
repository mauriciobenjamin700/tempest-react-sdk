import { describe, expect, it } from "vitest";
import { createRoleAccessControl } from "./create-role-access-control";

describe("createRoleAccessControl", () => {
    it("matches the global wildcard `*`", () => {
        const ac = createRoleAccessControl({ permissions: ["*"] });
        expect(ac.can({ action: "delete", resource: "posts" })).toEqual({ can: true });
        expect(ac.can({ action: "anything" })).toEqual({ can: true });
    });

    it("matches a resource wildcard `posts:*`", () => {
        const ac = createRoleAccessControl({ permissions: ["posts:*"] });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({ can: true });
        expect(ac.can({ action: "read", resource: "posts" })).toEqual({ can: true });
    });

    it("matches an exact `posts:create` permission", () => {
        const ac = createRoleAccessControl({ permissions: ["posts:create"] });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({ can: true });
    });

    it("matches a bare action when no resource is given", () => {
        const ac = createRoleAccessControl({ permissions: ["impersonate"] });
        expect(ac.can({ action: "impersonate" })).toEqual({ can: true });
    });

    it("expands permissions from active roles", () => {
        const ac = createRoleAccessControl({
            role: "editor",
            roles: {
                editor: ["posts:*", "comments:read"],
                admin: ["*"],
            },
        });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({ can: true });
        expect(ac.can({ action: "read", resource: "comments" })).toEqual({ can: true });
        expect(ac.can({ action: "delete", resource: "comments" })).toEqual({
            can: false,
            reason: "missing permission",
        });
    });

    it("merges multiple active roles", () => {
        const ac = createRoleAccessControl({
            role: ["viewer", "writer"],
            roles: {
                viewer: ["posts:read"],
                writer: ["posts:create"],
            },
        });
        expect(ac.can({ action: "read", resource: "posts" })).toEqual({ can: true });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({ can: true });
    });

    it("denies with a reason when no permission matches", () => {
        const ac = createRoleAccessControl({ permissions: ["posts:read"] });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({
            can: false,
            reason: "missing permission",
        });
    });

    it("does not let a bare action match a resource-scoped check", () => {
        const ac = createRoleAccessControl({ permissions: ["create"] });
        expect(ac.can({ action: "create", resource: "posts" })).toEqual({
            can: false,
            reason: "missing permission",
        });
    });
});
