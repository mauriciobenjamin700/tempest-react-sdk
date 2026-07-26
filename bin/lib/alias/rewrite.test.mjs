import { describe, expect, it } from "vitest";

import { rewriteSource } from "./rewrite.mjs";
import { loadTypeScript } from "./typescript.mjs";

const ts = loadTypeScript(process.cwd());
const BASE = "/proj/src";
const FILE = "/proj/src/pages/admin/Users.tsx";

const rewrite = (text, filePath = FILE) =>
    rewriteSource({ text, filePath, prefix: "@", baseDir: BASE, ts });

describe("rewriteSource — import / export positions", () => {
    it("converts a value import", () => {
        const { text, changes } = rewrite(`import { api } from "../../lib/api";\n`);
        expect(text).toBe(`import { api } from "@/lib/api";\n`);
        expect(changes).toEqual([{ from: "../../lib/api", to: "@/lib/api", line: 1 }]);
    });
    it("converts a type-only import", () => {
        const { text } = rewrite(`import type { User } from "../../types/user";\n`);
        expect(text).toBe(`import type { User } from "@/types/user";\n`);
    });
    it("converts a side-effect import", () => {
        const { text } = rewrite(`import "../../styles/global.css";\n`);
        expect(text).toBe(`import "@/styles/global.css";\n`);
    });
    it("converts a re-export", () => {
        const { text } = rewrite(`export { api } from "../../lib/api";\nexport * from "../x";\n`);
        expect(text).toBe(`export { api } from "@/lib/api";\nexport * from "@/pages/x";\n`);
    });
    it("converts an inline import type node", () => {
        const { text } = rewrite(`type A = import("../../types/user").User;\n`);
        expect(text).toBe(`type A = import("@/types/user").User;\n`);
    });
    it("converts a dynamic import", () => {
        const { text } = rewrite(`const m = await import("../../pages/Dashboard");\n`);
        expect(text).toBe(`const m = await import("@/pages/Dashboard");\n`);
    });
    it("converts vi.mock and its paired import together", () => {
        const { text, changes } = rewrite(
            `import { api } from "../../lib/api";\nvi.mock("../../lib/api");\n`,
        );
        expect(text).toBe(`import { api } from "@/lib/api";\nvi.mock("@/lib/api");\n`);
        expect(changes.map((ch) => ch.line)).toEqual([1, 2]);
    });
    it("converts vi.doMock", () => {
        const { text } = rewrite(`vi.doMock("../../lib/api", () => ({}));\n`);
        expect(text).toBe(`vi.doMock("@/lib/api", () => ({}));\n`);
    });
});

describe("rewriteSource — positions it must not touch", () => {
    it("ignores a path in a plain variable", () => {
        const src = `const p = "../../lib/api";\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a path in a line comment", () => {
        const src = `// see "../../lib/api"\nconst a = 1;\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a path in a block comment above an import", () => {
        const src = `/* was "../../lib/old" */\nimport { api } from "../../lib/api";\n`;
        expect(rewrite(src).text).toBe(
            `/* was "../../lib/old" */\nimport { api } from "@/lib/api";\n`,
        );
    });
    it("ignores a template literal", () => {
        const src = "const p = `../../lib/api`;\n";
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a dynamic import with an interpolated specifier", () => {
        const src = "const m = await import(`../../pages/${name}`);\n";
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a dynamic import with a computed specifier", () => {
        const src = `const m = await import(path);\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores require()", () => {
        const src = `const api = require("../../lib/api");\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a mock-looking call on another object", () => {
        const src = `jest.mock("../../lib/api");\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a sibling import", () => {
        const src = `import { Row } from "./Row";\nimport css from "./Users.module.css";\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("ignores a target outside the alias base", () => {
        const src = `import cfg from "../../../vite.config";\n`;
        expect(rewrite(src).text).toBe(src);
    });
});

describe("rewriteSource — file scope", () => {
    it("leaves a file outside the alias base untouched", () => {
        const src = `import { x } from "../src/lib/api";\n`;
        const { text, changes } = rewrite(src, "/proj/e2e/spec.ts");
        expect(text).toBe(src);
        expect(changes).toEqual([]);
    });
});

describe("rewriteSource — mechanics", () => {
    it("preserves single quotes", () => {
        const { text } = rewrite(`import { api } from '../../lib/api';\n`);
        expect(text).toBe(`import { api } from '@/lib/api';\n`);
    });
    it("rewrites several specifiers on one line without sliding offsets", () => {
        const { text } = rewrite(
            `import { a } from "../../lib/a";import { b } from "../../lib/b";\n`,
        );
        expect(text).toBe(`import { a } from "@/lib/a";import { b } from "@/lib/b";\n`);
    });
    it("reports the line of each change", () => {
        const { changes } = rewrite(
            `import { a } from "../../lib/a";\n\n\nimport { b } from "../../lib/b";\n`,
        );
        expect(changes.map((ch) => ch.line)).toEqual([1, 4]);
    });
    it("does not reorder or reformat anything", () => {
        const { text } = rewrite(
            `import {z} from "../../lib/z";\nimport {a} from "../../lib/a";\n`,
        );
        expect(text).toBe(`import {z} from "@/lib/z";\nimport {a} from "@/lib/a";\n`);
    });
    it("is idempotent", () => {
        const first = rewrite(`import { api } from "../../lib/api";\n`);
        const second = rewrite(first.text);
        expect(second.text).toBe(first.text);
        expect(second.changes).toEqual([]);
    });
    it("parses JSX without losing the specifiers after it", () => {
        const { text } = rewrite(
            `const el = <div className="x" />;\nimport { api } from "../../lib/api";\n`,
        );
        expect(text).toContain(`"@/lib/api"`);
    });
    it("parses a .ts file where < is a comparison", () => {
        const { text } = rewrite(
            `const ok = a < b;\nimport { api } from "../../lib/api";\n`,
            "/proj/src/pages/admin/users.ts",
        );
        expect(text).toContain(`"@/lib/api"`);
    });
});
