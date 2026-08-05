import { describe, expect, it } from "vitest";

import { scanFile } from "./scan.mjs";

const codes = (result) => result.findings.map((f) => f.code);

const bigComponent = (lines) =>
    [
        "export function Big() {",
        ...Array.from({ length: lines }, (_, i) => `  const v${i} = ${i};`),
        "  return null;",
        "}",
    ].join("\n");

describe("scanFile — what is not a props type", () => {
    it("does not read a string union named *Props as a props type", () => {
        const source = [
            'type OverriddenDomProps = "children" | "onSubmit";',
            "",
            "export interface CardProps {",
            ...Array.from({ length: 12 }, (_, i) => `  prop${i}?: string;`),
            "}",
            "",
            "export function Card(props: CardProps) {",
            "  return props;",
            "}",
        ].join("\n");
        const result = scanFile({ file: "src/Card.tsx", source });
        const propsFindings = result.findings.filter((f) => f.code === "props-count");
        expect(propsFindings).toHaveLength(1);
        expect(propsFindings[0].message).toContain("CardProps");
        expect(propsFindings[0].message).not.toContain("OverriddenDomProps");
    });

    it("reports the type once, not again for the destructuring that mirrors it", () => {
        const props = Array.from({ length: 9 }, (_, i) => `prop${i}`);
        const source = [
            "export interface PanelProps {",
            ...props.map((p) => `  ${p}?: string;`),
            "}",
            "",
            `export function Panel({ ${props.join(", ")} }: PanelProps) {`,
            `  return ${props[0]};`,
            "}",
        ].join("\n");
        const propsFindings = scanFile({ file: "src/Panel.tsx", source }).findings.filter(
            (f) => f.code === "props-count",
        );
        expect(propsFindings).toHaveLength(1);
        expect(propsFindings[0].message).toContain("PanelProps has 9 props");
    });

    it("still reports a destructuring that goes past its own type", () => {
        const source = [
            "export interface WideProps {",
            "  a?: string;",
            "}",
            "",
            "export function Wide({ a, b, c, d, e, f, g, h, i }: WideProps & Extra) {",
            "  return a;",
            "}",
        ].join("\n");
        const messages = scanFile({ file: "src/Wide.tsx", source })
            .findings.filter((f) => f.code === "props-count")
            .map((f) => f.message);
        expect(messages.some((m) => m.includes("destructures 9 props"))).toBe(true);
    });
});

describe("scanFile — barrels", () => {
    it("does not size-check a file that only re-exports", () => {
        const source = Array.from(
            { length: 260 },
            (_, i) => `export { Thing${i}, type Thing${i}Props } from "./thing-${i}";`,
        ).join("\n");
        expect(codes(scanFile({ file: "src/components/index.ts", source }))).not.toContain(
            "file-lines",
        );
    });

    it("still size-checks a file that re-exports and also holds logic", () => {
        const source = [
            ...Array.from({ length: 200 }, (_, i) => `export { T${i} } from "./t-${i}";`),
            "export function helper() {",
            ...Array.from({ length: 40 }, (_, i) => `  const v${i} = ${i};`),
            "  return 1;",
            "}",
        ].join("\n");
        expect(codes(scanFile({ file: "src/mixed.ts", source }))).toContain("file-lines");
    });
});

describe("scanFile — size", () => {
    it("reports a .tsx over the component limit", () => {
        const result = scanFile({ file: "src/Big.tsx", source: bigComponent(200) });
        expect(codes(result)).toContain("file-lines");
    });

    it("uses the larger limit for a .ts module", () => {
        const source = Array.from({ length: 180 }, (_, i) => `export const v${i} = ${i};`).join(
            "\n",
        );
        expect(codes(scanFile({ file: "src/tokens.ts", source }))).not.toContain("file-lines");
    });

    it("does not size-check a test file", () => {
        const result = scanFile({ file: "src/Big.test.tsx", source: bigComponent(200) });
        expect(codes(result)).not.toContain("file-lines");
    });

    it("reports a function body over the limit", () => {
        const result = scanFile({
            file: "src/util.ts",
            source: bigComponent(120),
            limits: { moduleFileLines: 10_000 },
        });
        expect(codes(result)).toContain("function-lines");
    });

    it("gives a hook its own, larger limit", () => {
        const source = [
            "export function useThing() {",
            ...Array.from({ length: 120 }, (_, i) => `  const v${i} = ${i};`),
            "  return null;",
            "}",
        ].join("\n");
        const result = scanFile({
            file: "src/use-thing.ts",
            source,
            limits: { moduleFileLines: 10_000 },
        });
        expect(codes(result)).toContain("hook-lines");
        expect(codes(result)).not.toContain("function-lines");
    });

    it("honours a limit override", () => {
        const source = bigComponent(20);
        expect(codes(scanFile({ file: "src/A.tsx", source }))).not.toContain("file-lines");
        expect(
            codes(scanFile({ file: "src/A.tsx", source, limits: { componentFileLines: 5 } })),
        ).toContain("file-lines");
    });
});

describe("scanFile — shape", () => {
    it("reports a Props type with too many members", () => {
        const source = `interface CardProps {\n${Array.from({ length: 9 }, (_, i) => `  p${i}: string;`).join("\n")}\n}`;
        const result = scanFile({ file: "src/Card.tsx", source });
        expect(codes(result)).toContain("props-count");
        expect(result.findings[0].message).toContain("CardProps has 9 props");
    });

    it("reports a component destructuring too many props", () => {
        const source =
            "export function Card({ a, b, c, d, e, f, g, h, className, ...rest }: P) {\n  return null;\n}";
        expect(codes(scanFile({ file: "src/Card.tsx", source }))).toContain("props-count");
    });

    it("does not count plumbing towards the props limit", () => {
        const source =
            "export function Card({ a, b, c, className, children, style, id, ...rest }: P) {\n  return null;\n}";
        expect(codes(scanFile({ file: "src/Card.tsx", source }))).not.toContain("props-count");
    });

    it("reports an exported function with too many parameters", () => {
        const source = "export function f(a, b, c, d) {\n  return a;\n}";
        expect(codes(scanFile({ file: "src/f.ts", source }))).toContain("param-count");
    });

    it("leaves a private helper's parameter list alone", () => {
        const source = "function inner(a, b, c, d, e) {\n  return a;\n}";
        expect(codes(scanFile({ file: "src/f.ts", source }))).not.toContain("param-count");
    });
});

describe("scanFile — type escapes", () => {
    it("reports an explicit any", () => {
        const result = scanFile({
            file: "src/f.ts",
            source: "export function f(x: any) {\n  return x;\n}",
        });
        expect(codes(result)).toContain("explicit-any");
    });

    it("reports an as-any cast", () => {
        expect(codes(scanFile({ file: "src/f.ts", source: "const v = raw as any;" }))).toContain(
            "explicit-any",
        );
    });

    it("does not match a word that merely contains any", () => {
        const source = "const v: Company = { anyOf: 1 };\nlet u: unknown;";
        expect(codes(scanFile({ file: "src/f.ts", source }))).not.toContain("explicit-any");
    });

    it("does not match the word any inside a comment or a string", () => {
        const source = '// accepts any shape\nconst s = "any";';
        expect(codes(scanFile({ file: "src/f.ts", source }))).not.toContain("explicit-any");
    });

    it("respects an existing eslint-disable for no-explicit-any", () => {
        const source =
            "// eslint-disable-next-line @typescript-eslint/no-explicit-any\ntype K = (...args: any[]) => void;";
        expect(codes(scanFile({ file: "src/f.ts", source }))).not.toContain("explicit-any");
    });

    it("downgrades any in a test file to info", () => {
        const result = scanFile({ file: "src/f.test.ts", source: "const m = {} as any;" });
        expect(result.findings.find((f) => f.code === "explicit-any").severity).toBe("info");
    });

    it("reports @ts-ignore once", () => {
        const source = "// @ts-ignore\nconst v = 1;\n// @ts-ignore\nconst u = 2;";
        expect(
            codes(scanFile({ file: "src/f.ts", source })).filter((c) => c === "ts-ignore"),
        ).toHaveLength(1);
    });
});

describe("scanFile — behaviour", () => {
    it("reports fetch inside a component file", () => {
        const source = "export function List() {\n  fetch('/api');\n  return null;\n}";
        expect(codes(scanFile({ file: "src/List.tsx", source }))).toContain("fetch-in-component");
    });

    it("leaves fetch in a service alone", () => {
        const source = "export async function list() {\n  return fetch('/api');\n}";
        expect(codes(scanFile({ file: "src/list.service.ts", source }))).not.toContain(
            "fetch-in-component",
        );
    });

    it("reports an empty catch, comment or not", () => {
        const bare = "try {\n  go();\n} catch {}";
        const commented = "try {\n  go();\n} catch (e) {\n  // ignore\n}";
        expect(codes(scanFile({ file: "src/a.ts", source: bare }))).toContain("empty-catch");
        expect(codes(scanFile({ file: "src/a.ts", source: commented }))).toContain("empty-catch");
    });

    it("leaves a catch that does something alone", () => {
        const source = "try {\n  go();\n} catch (e) {\n  report(e);\n}";
        expect(codes(scanFile({ file: "src/a.ts", source }))).not.toContain("empty-catch");
    });

    it("reports a hardcoded colour in an inline style", () => {
        const source = 'export function A() {\n  return <div style={{ color: "#2563eb" }} />;\n}';
        expect(codes(scanFile({ file: "src/A.tsx", source }))).toContain("inline-style-literal");
    });
});

describe("scanFile — waivers", () => {
    it("suppresses a waived rule and records the reason", () => {
        const source = [
            "/**",
            " * Cropper.",
            " *",
            " * @tempest-limits file-lines — drag, zoom and canvas export share one piece",
            " * of geometry state.",
            " */",
            bigComponent(200),
        ].join("\n");
        const result = scanFile({ file: "src/Crop.tsx", source });
        expect(codes(result)).not.toContain("file-lines");
        expect(result.waivers).toEqual([
            { code: "file-lines", reason: expect.stringContaining("geometry state") },
        ]);
    });

    it("reports a waiver with no reason", () => {
        const result = scanFile({
            file: "src/Crop.tsx",
            source: `// @tempest-limits file-lines\n${bigComponent(200)}`,
        });
        expect(codes(result)).toContain("marker-without-reason");
        expect(codes(result)).not.toContain("file-lines");
    });
});

describe("scanFile — clean input", () => {
    it("finds nothing in a well-shaped component", () => {
        const source = [
            "import { Badge } from 'tempest-react-sdk';",
            "",
            "interface RowProps {",
            "  label: string;",
            "  tone: 'ok' | 'bad';",
            "}",
            "",
            "/** One row of the orders table. */",
            "export function Row({ label, tone }: RowProps) {",
            "  return <Badge variant={tone}>{label}</Badge>;",
            "}",
        ].join("\n");
        expect(scanFile({ file: "src/Row.tsx", source }).findings).toEqual([]);
    });
});
