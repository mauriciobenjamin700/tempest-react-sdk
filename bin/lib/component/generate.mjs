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
 *
 * `hooks.ts` reaches React through `import * as React` rather than a named
 * import, so no generated name can ever redeclare what the file imports. The
 * hook is `use<Name>`, or `use<Name>Component` when that would be a React
 * built-in (see {@link REACT_BUILTIN_HOOKS}).
 */

const WORD = /[A-Za-z0-9]+/g;

/**
 * Folder names Windows reserves for devices, matched case-insensitively. A
 * folder called `Con` or `Lpt1` cannot be created or cloned there, so a project
 * with one breaks for every Windows teammate.
 */
/**
 * React's built-in hook names. Ported from the `react` and `react-dom` hook
 * exports (React 19). A component whose `use<Name>` lands on one of them gets
 * `use<Name>Component` instead: the `react-hooks` lint rules match hooks by name,
 * so a custom `useMemo(title)` would be linted as React's and warned about.
 */
export const REACT_BUILTIN_HOOKS = new Set([
    "use",
    "useActionState",
    "useCallback",
    "useContext",
    "useDebugValue",
    "useDeferredValue",
    "useEffect",
    "useEffectEvent",
    "useFormStatus",
    "useId",
    "useImperativeHandle",
    "useInsertionEffect",
    "useLayoutEffect",
    "useMemo",
    "useOptimistic",
    "useReducer",
    "useRef",
    "useState",
    "useSyncExternalStore",
    "useTransition",
]);

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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
 * @throws {Error} When the name is empty, has characters other than ASCII
 *   letters, digits, spaces, `-` and `_`, does not start with a letter, or is a
 *   device name Windows reserves (`Con`, `Nul`, `Com1`…).
 */
export function normalizeComponentName(raw) {
    const input = typeof raw === "string" ? raw.trim() : "";
    if (!input) {
        throw new Error("Missing component name. Usage: tempest gen component <Name>");
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(input)) {
        throw new Error(
            `Invalid component name ${JSON.stringify(input)}: use ASCII letters, digits, spaces, "-" or "_".`,
        );
    }
    if (!/^[A-Za-z]/.test(input)) {
        throw new Error(
            `Invalid component name ${JSON.stringify(input)}: it must start with a letter.`,
        );
    }
    const words = input.replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(WORD) ?? [];
    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    if (WINDOWS_RESERVED.test(name)) {
        throw new Error(
            `Invalid component name ${JSON.stringify(input)}: "${name}" is a reserved device name on Windows and cannot be a folder there.`,
        );
    }
    return name;
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
    const hook = REACT_BUILTIN_HOOKS.has(`use${name}`) ? `use${name}Component` : `use${name}`;
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
        `import * as React from "react";`,
        ``,
        `import { ${constant} } from "./constants";`,
        ``,
        `export function ${hook}(title?: string): { heading: string } {`,
        `  const heading = React.useMemo(() => title?.trim() || ${constant}, [title]);`,
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
