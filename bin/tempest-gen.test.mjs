import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "tempest.mjs");

const SPEC = {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    paths: {
        "/users": {
            get: {
                tags: ["users"],
                operationId: "listUsers",
                responses: { 200: { description: "ok" } },
            },
        },
    },
};

/**
 * Every file under `dir`, relative, sorted — `[]` when nothing was written.
 *
 * @param {string} dir - Absolute folder.
 * @returns {string[]}
 */
function filesUnder(dir) {
    return readdirSync(dir, { recursive: true }).sort();
}

describe("tempest gen api / gen icons — write containment (#484)", () => {
    let cwd;
    let outside;

    beforeEach(() => {
        cwd = mkdtempSync(join(tmpdir(), "tempest-gen-cli-"));
        outside = mkdtempSync(join(tmpdir(), "tempest-gen-outside-"));
        mkdirSync(join(cwd, "src"));
        writeFileSync(join(cwd, "spec.json"), JSON.stringify(SPEC));
    });

    afterEach(() => {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    });

    /**
     * Run the `tempest` CLI in the temporary project.
     *
     * @param {string[]} args - CLI arguments.
     * @returns {{ status: number | null, out: string }}
     */
    function tempest(...args) {
        const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
        return { status: result.status, out: result.stdout + result.stderr };
    }

    it("gen api still writes into a regular src/api", () => {
        const { status } = tempest("gen", "api", "spec.json");
        expect(status).toBe(0);
        expect(existsSync(join(cwd, "src", "api", "users", "service.ts"))).toBe(true);
    });

    it("gen api refuses a src/api that is a symlink leaving the project", () => {
        symlinkSync(outside, join(cwd, "src", "api"));

        const { status, out } = tempest("gen", "api", "spec.json");

        expect(status).toBe(1);
        expect(out).toMatch(/src\/api is a symlink/);
        expect(filesUnder(outside)).toEqual([]);
    });

    it("gen api refuses a symlinked --out even when it points inside the project", () => {
        mkdirSync(join(cwd, "elsewhere"));
        symlinkSync(join(cwd, "elsewhere"), join(cwd, "src", "api"));

        const { status, out } = tempest("gen", "api", "spec.json");

        expect(status).toBe(1);
        expect(out).toMatch(/symlink/);
        expect(filesUnder(join(cwd, "elsewhere"))).toEqual([]);
    });

    it("gen api refuses a dangling symlink, which writeFile would follow and create", () => {
        symlinkSync(join(outside, "not-yet"), join(cwd, "src", "api"));

        const { status, out } = tempest("gen", "api", "spec.json");

        expect(status).toBe(1);
        expect(out).toMatch(/symlink/);
        expect(existsSync(join(outside, "not-yet"))).toBe(false);
    });

    it("gen api refuses a symlinked route-group folder below --out, before writing anything", () => {
        mkdirSync(join(cwd, "src", "api"));
        symlinkSync(outside, join(cwd, "src", "api", "users"));

        const { status, out } = tempest("gen", "api", "spec.json");

        expect(status).toBe(1);
        expect(out).toMatch(/src\/api\/users is a symlink/);
        expect(filesUnder(outside)).toEqual([]);
        expect(filesUnder(join(cwd, "src", "api"))).toEqual(["users"]);
    });

    it("gen api refuses a generated file that is a symlink", () => {
        mkdirSync(join(cwd, "src", "api"));
        const victim = join(outside, "victim.ts");
        writeFileSync(victim, "SENTINEL");
        symlinkSync(victim, join(cwd, "src", "api", "index.ts"));

        const { status, out } = tempest("gen", "api", "spec.json");

        expect(status).toBe(1);
        expect(out).toMatch(/src\/api\/index\.ts is a symlink/);
        expect(readFileSync(victim, "utf8")).toBe("SENTINEL");
    });

    it("gen api refuses an --out whose existing ancestor is a symlink leaving the project", () => {
        symlinkSync(outside, join(cwd, "gen"));

        const { status, out } = tempest("gen", "api", "spec.json", "--out", "gen/api");

        expect(status).toBe(1);
        expect(out).toMatch(/outside the project/);
        expect(filesUnder(outside)).toEqual([]);
    });

    it("gen api refuses an --out outside the project", () => {
        const { status, out } = tempest("gen", "api", "spec.json", "--out", outside);
        expect(status).toBe(1);
        expect(out).toMatch(/outside the project/);
        expect(filesUnder(outside)).toEqual([]);
    });

    it("gen icons refuses a src/icons.generated.ts that is a symlink", () => {
        const victim = join(outside, "victim.ts");
        writeFileSync(victim, "SENTINEL");
        symlinkSync(victim, join(cwd, "src", "icons.generated.ts"));

        const { status, out } = tempest("gen", "icons");

        expect(status).toBe(1);
        expect(out).toMatch(/src\/icons\.generated\.ts is a symlink/);
        expect(readFileSync(victim, "utf8")).toBe("SENTINEL");
    });

    it("gen icons refuses a dangling symlink at the output", () => {
        symlinkSync(join(outside, "not-yet.ts"), join(cwd, "src", "icons.generated.ts"));

        const { status, out } = tempest("gen", "icons");

        expect(status).toBe(1);
        expect(out).toMatch(/symlink/);
        expect(existsSync(join(outside, "not-yet.ts"))).toBe(false);
    });

    it("gen icons refuses an --out whose folder is a symlink leaving the project", () => {
        symlinkSync(outside, join(cwd, "gen"));

        const { status, out } = tempest("gen", "icons", "--out", "gen/icons.ts");

        expect(status).toBe(1);
        expect(out).toMatch(/gen is a symlink/);
        expect(filesUnder(outside)).toEqual([]);
    });

    it("gen icons refuses an --out outside the project", () => {
        const { status, out } = tempest("gen", "icons", "--out", join(outside, "icons.ts"));
        expect(status).toBe(1);
        expect(out).toMatch(/outside the project/);
        expect(filesUnder(outside)).toEqual([]);
    });
});

describe("tempest gen api — spec text never drives the terminal (#533)", () => {
    const TERMINAL_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
    const SGR = /\u001b\[\d+(?:;\d+)*m/g;
    let cwd;

    beforeEach(() => {
        cwd = mkdtempSync(join(tmpdir(), "tempest-gen-tty-"));
        mkdirSync(join(cwd, "src"));
    });

    afterEach(() => {
        rmSync(cwd, { recursive: true, force: true });
    });

    /**
     * Write `doc` as the project's spec and run `tempest gen api` on it.
     *
     * @param {object} doc - The OpenAPI document.
     * @returns {{ status: number | null, out: string }} Exit code and the
     *   combined output with the CLI's own color codes removed.
     */
    function genApi(doc) {
        writeFileSync(join(cwd, "spec.json"), JSON.stringify(doc));
        const result = spawnSync(process.execPath, [CLI, "gen", "api", "spec.json"], {
            cwd,
            encoding: "utf8",
        });
        return { status: result.status, out: (result.stdout + result.stderr).replace(SGR, "") };
    }

    it("a tag carrying OSC, CSI and carriage-return sequences prints without them", () => {
        const tag = "users\u001b]0;PWNED\u0007\u001b]8;;https://evil/\u001b\\x\u009b2J\r";
        const { status, out } = genApi({
            ...SPEC,
            paths: {
                "/users": { get: { tags: [tag], responses: { 200: { description: "ok" } } } },
            },
        });

        expect(status).toBe(0);
        expect(out).not.toMatch(TERMINAL_CONTROL);
        expect(out).not.toContain("\u001b]");
        expect(out).toContain("users]0;PWNED]8;;https://evil/\\x2J");
    });

    it("the usage hint names the folder and class that were generated", () => {
        const { out } = genApi({
            ...SPEC,
            paths: {
                "/users": {
                    get: { tags: ["User Profiles"], responses: { 200: { description: "ok" } } },
                },
            },
        });

        expect(out).toContain('import { UserProfilesService } from "@/api/user-profiles";');
    });

    it("a refusal that quotes a C1 control from the spec prints without it", () => {
        const { status, out } = genApi({
            ...SPEC,
            paths: { "https://x\u009b2J/": { get: { responses: { 200: { description: "ok" } } } } },
        });

        expect(status).toBe(1);
        expect(out).toMatch(/does not start with "\/"/);
        expect(out).not.toMatch(TERMINAL_CONTROL);
    });

    it("a nested-quantifier pattern is printed as a warning and the files are still written", () => {
        const { status, out } = genApi({
            ...SPEC,
            components: {
                schemas: {
                    Q: { type: "object", properties: { s: { type: "string", pattern: "(a+)+" } } },
                },
            },
            paths: {
                "/users": {
                    post: {
                        tags: ["users"],
                        requestBody: {
                            content: {
                                "application/json": { schema: { $ref: "#/components/schemas/Q" } },
                            },
                        },
                        responses: { 200: { description: "ok" } },
                    },
                },
            },
        });

        expect(status).toBe(0);
        expect(out).toMatch(
            /! OpenAPI schema "Q" at properties\.s: pattern "\(a\+\)\+" repeats a group/,
        );
        expect(existsSync(join(cwd, "src", "api", "users", "schemas.ts"))).toBe(true);
    });
});
