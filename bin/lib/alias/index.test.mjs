import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aliasImports } from "./index.mjs";

let root;

/**
 * Build a project fixture whose `typescript` resolves to this repo's copy.
 *
 * The symlinked `node_modules` is what makes `loadTypeScript` succeed from a
 * directory outside the repo — the codemod deliberately refuses to fall back to
 * a compiler the project does not have, so a fixture without it can only ever
 * exercise the `no-typescript` branch.
 */
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-alias-run-"));
    symlinkSync(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Write a fixture file, creating parent directories. */
function write(rel, contents) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
}

/** Read a fixture file back. */
function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

const run = (targets = ["."], dryRun = false) => aliasImports({ root, targets, dryRun });

describe("aliasImports — writing", () => {
    it("rewrites source and style files and reports the totals", () => {
        write(
            "src/pages/admin/Login.tsx",
            `import { api } from "../../lib/api";\nimport "../x.css";\n`,
        );
        write("src/pages/admin/Login.module.css", `@import "../../styles/tokens.css";\n`);

        const result = run();

        expect(result.status).toBe("ok");
        expect(result.prefix).toBe("@");
        expect(result.total).toBe(3);
        expect(result.files.map((f) => f.path.split("\\").join("/")).sort()).toEqual([
            "src/pages/admin/Login.module.css",
            "src/pages/admin/Login.tsx",
        ]);
        expect(read("src/pages/admin/Login.tsx")).toBe(
            `import { api } from "@/lib/api";\nimport "@/pages/x.css";\n`,
        );
        expect(read("src/pages/admin/Login.module.css")).toBe(`@import "@/styles/tokens.css";\n`);
    });

    it("leaves files it must not touch alone", () => {
        write("src/pages/admin/Login.tsx", `import { Row } from "./Row";\n`);
        write("src/pages/admin/Deep.tsx", `import cfg from "../../../vite.config";\n`);
        write("vite.config.ts", `import x from "./src/lib/api";\n`);
        write("e2e/spec.ts", `import { api } from "../src/lib/api";\n`);

        const result = run();

        expect(result.total).toBe(0);
        expect(result.files).toEqual([]);
        expect(read("src/pages/admin/Deep.tsx")).toBe(`import cfg from "../../../vite.config";\n`);
        expect(read("vite.config.ts")).toBe(`import x from "./src/lib/api";\n`);
        expect(read("e2e/spec.ts")).toBe(`import { api } from "../src/lib/api";\n`);
    });

    it("is idempotent across two runs", () => {
        write("src/pages/admin/Login.tsx", `import { api } from "../../lib/api";\n`);
        expect(run().total).toBe(1);
        const after = read("src/pages/admin/Login.tsx");
        expect(run().total).toBe(0);
        expect(read("src/pages/admin/Login.tsx")).toBe(after);
    });

    it("restricts the rewrite to a positional path", () => {
        write("src/pages/admin/Login.tsx", `import { api } from "../../lib/api";\n`);
        write("src/widgets/nested/Card.tsx", `import { api } from "../../lib/api";\n`);

        expect(run(["src/pages"]).total).toBe(1);
        expect(read("src/widgets/nested/Card.tsx")).toBe(`import { api } from "../../lib/api";\n`);
    });
});

describe("aliasImports — dry run", () => {
    it("reports the changes without writing", () => {
        const before = `import { api } from "../../lib/api";\n`;
        write("src/pages/admin/Login.tsx", before);

        const result = run(["."], true);

        expect(result.total).toBe(1);
        expect(result.files[0].changes).toEqual([
            { from: "../../lib/api", to: "@/lib/api", line: 1 },
        ]);
        expect(read("src/pages/admin/Login.tsx")).toBe(before);
    });
});

describe("aliasImports — degraded projects", () => {
    it("reports no-typescript when the project has no compiler", () => {
        const bare = mkdtempSync(join(tmpdir(), "tempest-alias-bare-"));
        try {
            expect(aliasImports({ root: bare, targets: ["."] })).toMatchObject({
                status: "no-typescript",
                total: 0,
                files: [],
            });
        } finally {
            rmSync(bare, { recursive: true, force: true });
        }
    });

    it("reports no-alias and writes nothing when no tsconfig declares one", () => {
        rmSync(join(root, "tsconfig.json"));
        const before = `import { api } from "../../lib/api";\n`;
        write("src/pages/admin/Login.tsx", before);

        expect(run()).toMatchObject({ status: "no-alias", total: 0, files: [] });
        expect(read("src/pages/admin/Login.tsx")).toBe(before);
    });
});
