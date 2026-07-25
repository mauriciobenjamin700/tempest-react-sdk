import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist", "node_modules"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
            parserOptions: { tsconfigRootDir: import.meta.dirname },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
            "simple-import-sort": simpleImportSort,
            "unused-imports": unusedImports,
        },
        rules: {
            // react-hooks v7 ships the React Compiler rules inside `recommended`
            // (refs, set-state-in-effect, purity…). They are opinionated enough to
            // fail a fresh app on day one, so the classic pair is enforced and the
            // rest is opt-in: add `...reactHooks.configs.recommended.rules` here
            // once you want the compiler-grade checks.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "@typescript-eslint/consistent-type-imports": "error",
            // Organize imports/exports (tempest fix).
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            // Remove dead imports + flag unused vars (tempest fix).
            "@typescript-eslint/no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            // Tidy whitespace (tempest fix).
            "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
            "no-trailing-spaces": "error",
            "eol-last": ["error", "always"],
        },
    },
);
