/**
 * Guard: a public member present in every sibling but one is a forgotten port.
 *
 * This exists because of #125. `warmup()` landed on `Detector`, `Segmenter` and
 * `DetectClassify` in 0.39.0 and not on `Classifier`, and it took two releases
 * and a real app hitting a memory ceiling for anyone to notice — while the
 * documentation had been claiming all four had it the whole time. Nobody lied;
 * the intent was there and the implementation simply did not follow. That is how
 * a family of sibling classes fails: the feature lands where the author is
 * looking, and the sibling nobody opened that day stays behind.
 *
 * Running this heuristic against the pre-fix tree reports exactly that:
 *
 *     warmup — missing from Classifier (present in 3/4)
 *
 * ## Why only the vision tasks
 *
 * The other candidate families — the telemetry adapters, the feature-flag
 * adapters — are factory functions returning objects typed by a shared
 * interface (`TelemetryAdapter`, `FeatureFlagsAdapter`). A missing member there
 * is a type error, so the compiler already guards them and a second check would
 * be redundant. The vision tasks are the case with no such contract: they extend
 * `VisionTask`, which carries only the session, so nothing forces symmetry.
 *
 * ## Why an allowlist, and why it must stay honest
 *
 * Asymmetry is sometimes the design. `DetectClassify` has no `numClasses`
 * because it holds two unrelated label spaces, and a single count would have to
 * pick one. Each such case is declared below with its reason — and a declaration
 * that stops being needed fails this suite too, so the list cannot drift into
 * fiction.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

/**
 * Sibling classes that should share a public surface, and the files holding
 * them. Vendored code is fair game: `src/vision/` is regenerated from upstream,
 * so a gap found here is reported there and comes back through
 * `npm run vendor:vision`, which is exactly how #125 was fixed.
 */
const FAMILIES: Record<string, readonly string[]> = {
    "vision tasks": [
        "src/vision/tasks/classifier.ts",
        "src/vision/tasks/detector.ts",
        "src/vision/tasks/segmenter.ts",
        "src/vision/tasks/detectClassify.ts",
    ],
};

/** Asymmetries that are the design, each with the reason it is not a gap. */
const DELIBERATE: Record<string, Record<string, string>> = {
    "vision tasks": {
        numClasses:
            "DetectClassify holds two unrelated label spaces (detector + classifier), so a " +
            "single count would have to pick one. It exposes `names` and `classifierNames` " +
            "instead.",
    },
};

interface Family {
    /** Class name → its public member names. */
    readonly members: Map<string, Set<string>>;
}

/**
 * Public members (methods, getters, fields) of every class declared in a file.
 *
 * Read off the AST rather than the type checker: a member that exists is a
 * member that was written, and this guard is about what someone forgot to
 * write. `private`/`protected` and `_`-prefixed names are internal by
 * convention and skipped.
 */
function publicMembers(file: string): Map<string, Set<string>> {
    const source = ts.createSourceFile(
        file,
        readFileSync(join(ROOT, file), "utf8"),
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TS,
    );
    const classes = new Map<string, Set<string>>();

    const visit = (node: ts.Node): void => {
        if (ts.isClassDeclaration(node) && node.name) {
            const names = new Set<string>();
            for (const member of node.members) {
                if (!member.name) continue;
                const hidden = member.modifiers?.some(
                    (modifier) =>
                        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
                        modifier.kind === ts.SyntaxKind.ProtectedKeyword,
                );
                if (hidden) continue;
                const name = member.name.getText(source);
                if (name.startsWith("_")) continue;
                if (
                    ts.isMethodDeclaration(member) ||
                    ts.isGetAccessorDeclaration(member) ||
                    ts.isPropertyDeclaration(member)
                ) {
                    names.add(name);
                }
            }
            classes.set(node.name.getText(source), names);
        }
        ts.forEachChild(node, visit);
    };

    visit(source);
    return classes;
}

function loadFamily(files: readonly string[]): Family {
    const members = new Map<string, Set<string>>();
    for (const file of files) {
        for (const [className, names] of publicMembers(file)) members.set(className, names);
    }
    return { members };
}

/** Members present in every sibling but one, as `name` → the class missing it. */
function asymmetries(family: Family): Map<string, string> {
    const counts = new Map<string, number>();
    for (const names of family.members.values()) {
        for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    const total = family.members.size;
    const found = new Map<string, string>();
    for (const [name, count] of counts) {
        if (count !== total - 1) continue;
        const missing = [...family.members].find(([, names]) => !names.has(name));
        if (missing) found.set(name, missing[0]);
    }
    return found;
}

describe.each(Object.entries(FAMILIES))("sibling parity — %s", (familyName, files) => {
    const family = loadFamily(files);
    const declared = DELIBERATE[familyName] ?? {};

    it("reads every sibling in the family", () => {
        expect(family.members.size).toBe(files.length);
    });

    it("has no member missing from exactly one sibling", () => {
        const found = asymmetries(family);
        const undeclared = [...found]
            .filter(([name]) => declared[name] === undefined)
            .map(([name, missingFrom]) => `${name} — missing from ${missingFrom}`);

        expect(undeclared).toEqual([]);
    });

    it("declares no asymmetry that no longer exists", () => {
        const found = asymmetries(family);
        const stale = Object.keys(declared).filter((name) => !found.has(name));

        expect(stale).toEqual([]);
    });
});
