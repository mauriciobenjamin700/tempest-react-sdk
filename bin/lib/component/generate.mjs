/**
 * Scaffold for `tempest gen component <Name>`: one folder per component with
 * `index.tsx`, `styles.module.css`, `constants.ts`, `utils.ts` and `hooks.ts`.
 *
 * Pure: takes a name, returns `{ name, files }`. The CLI does the I/O. The output
 * is written to pass the app template's own gates as generated — `tsc` under its
 * `strict` + `noUnusedLocals` tsconfig and ESLint under its `eslint.config.js`
 * (sorted imports, type-only imports, no unused code) — and follows the
 * template's Prettier config (double quotes, two-space indent, trailing commas).
 * Every file is wired into `index.tsx`, so none starts out as dead code.
 */

const WORD = /[A-Za-z0-9]+/g;

/**
 * Normalize a component name to PascalCase.
 *
 * Words are split on any non-alphanumeric character and on lower→upper case
 * boundaries, so `"user card"`, `"user-card"`, `"user_card"`, `"userCard"` and
 * `"UserCard"` all become `UserCard`. A word already in capitals (`"API"`) keeps
 * them after its first letter: `"api client"` → `ApiClient`, `"APIClient"` →
 * `APIClient`.
 *
 * @param {unknown} raw - The name as typed on the command line.
 * @returns {string} The PascalCase component name.
 * @throws {Error} When the name is empty, has characters other than letters,
 *   digits, spaces, `-` and `_`, or does not start with a letter.
 */
export function normalizeComponentName(raw) {
    const input = typeof raw === "string" ? raw.trim() : "";
    if (!input) {
        throw new Error("Missing component name. Usage: tempest gen component <Name>");
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(input)) {
        throw new Error(
            `Invalid component name ${JSON.stringify(input)}: use letters, digits, spaces, "-" or "_".`,
        );
    }
    if (!/^[A-Za-z]/.test(input)) {
        throw new Error(
            `Invalid component name ${JSON.stringify(input)}: it must start with a letter.`,
        );
    }
    const words = input.replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(WORD) ?? [];
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/**
 * Turn a PascalCase name into `UPPER_SNAKE_CASE` (`UserCard` → `USER_CARD`).
 *
 * @param {string} name - A PascalCase name.
 * @returns {string}
 */
function upperSnake(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .toUpperCase();
}

/**
 * Build the five files of a component folder.
 *
 * @param {string} rawName - The name as typed; normalized with
 *   {@link normalizeComponentName}.
 * @returns {{ name: string, files: Record<string, string> }} The PascalCase name
 *   (also the folder name) and a `{ fileName: contents }` map.
 * @throws {Error} When the name is invalid.
 */
export function componentFiles(rawName) {
    const name = normalizeComponentName(rawName);
    const constant = `${upperSnake(name)}_DEFAULT_TITLE`;
    const hook = `use${name}`;
    const props = `${name}Props`;

    const index = [
        `import { ${hook} } from "./hooks";`,
        `import styles from "./styles.module.css";`,
        `import { joinClassNames } from "./utils";`,
        ``,
        `export interface ${props} {`,
        `  title?: string;`,
        `  className?: string;`,
        `}`,
        ``,
        `export function ${name}({ title, className }: ${props}) {`,
        `  const { heading } = ${hook}(title);`,
        ``,
        `  return (`,
        `    <section className={joinClassNames(styles.root, className)}>`,
        `      <h2 className={styles.title}>{heading}</h2>`,
        `    </section>`,
        `  );`,
        `}`,
        ``,
    ].join("\n");

    const css = [
        `.root {`,
        `  display: flex;`,
        `  flex-direction: column;`,
        `  gap: var(--tempest-space-2);`,
        `}`,
        ``,
        `.title {`,
        `  margin: 0;`,
        `}`,
        ``,
    ].join("\n");

    const constants = [`export const ${constant} = ${JSON.stringify(name)};`, ``].join("\n");

    const utils = [
        `export function joinClassNames(...names: Array<string | false | null | undefined>): string {`,
        `  return names.filter(Boolean).join(" ");`,
        `}`,
        ``,
    ].join("\n");

    const hooks = [
        `import { useMemo } from "react";`,
        ``,
        `import { ${constant} } from "./constants";`,
        ``,
        `export function ${hook}(title?: string): { heading: string } {`,
        `  const heading = useMemo(() => title?.trim() || ${constant}, [title]);`,
        ``,
        `  return { heading };`,
        `}`,
        ``,
    ].join("\n");

    return {
        name,
        files: {
            "index.tsx": index,
            "styles.module.css": css,
            "constants.ts": constants,
            "utils.ts": utils,
            "hooks.ts": hooks,
        },
    };
}
