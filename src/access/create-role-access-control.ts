import type { AccessControl, CanParams, CanResult } from "./types";

export interface RoleAccessControlConfig {
    /** Permission strings granted directly, regardless of role. */
    permissions?: string[];
    /** Map of role name → permission strings granted by that role. */
    roles?: Record<string, string[]>;
    /** The active role(s). Their permissions (from `roles`) are merged in. */
    role?: string | string[];
}

function resolvePermissions(config: RoleAccessControlConfig): Set<string> {
    const set = new Set<string>(config.permissions ?? []);
    const roles = config.role ? (Array.isArray(config.role) ? config.role : [config.role]) : [];
    for (const role of roles) {
        for (const perm of config.roles?.[role] ?? []) {
            set.add(perm);
        }
    }
    return set;
}

/**
 * Build a simple RBAC {@link AccessControl} from a static permission set.
 *
 * Permission strings are `"<resource>:<action>"` (e.g. `"posts:create"`) or a
 * bare `"<action>"`. Wildcards are supported: `"*"` grants everything and
 * `"<resource>:*"` grants every action on a resource.
 *
 * The effective set is `config.permissions` plus, for each active role in
 * `config.role`, the permissions listed in `config.roles[role]`.
 *
 * @param config - Permissions, role map, and active role(s).
 * @returns An access-control strategy backed by the resolved permission set.
 *
 * @example
 * ```ts
 * const ac = createRoleAccessControl({
 *   role: "editor",
 *   roles: { editor: ["posts:*", "comments:read"] },
 * });
 * ac.can({ action: "create", resource: "posts" }); // true
 * ```
 */
export function createRoleAccessControl(config: RoleAccessControlConfig): AccessControl {
    const granted = resolvePermissions(config);

    return {
        can({ action, resource }: CanParams): CanResult {
            const allowed =
                granted.has("*") ||
                (resource !== undefined &&
                    (granted.has(`${resource}:*`) || granted.has(`${resource}:${action}`))) ||
                (resource === undefined && granted.has(action));

            return allowed ? { can: true } : { can: false, reason: "missing permission" };
        },
    };
}
