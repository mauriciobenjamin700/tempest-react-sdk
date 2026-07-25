import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "dist",
            "node_modules",
            "template",
            "template-pwa",
            // Generated output: the v8 HTML report ships its own vendored
            // scripts, and Playwright writes traces/screenshots.
            "coverage",
            "test-results",
            "playwright-report",
        ],
    },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
            // typescript-eslint refuses to guess the root once a lint run spans
            // two config roots (the repo and the shipped `template/`), which is
            // what happens when lint-staged passes explicit paths.
            parserOptions: { tsconfigRootDir: import.meta.dirname },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            // eslint-plugin-react-hooks v7 folded the React Compiler rule set into
            // `recommended` (refs, set-state-in-effect, purity, immutability…).
            // Those flag idioms this SDK uses on purpose — callback refs written
            // during render, effects that seed state from an external system — so
            // the classic pair stays enforced and adopting the compiler rules is
            // tracked separately instead of silently rewriting 80+ call sites.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        // The BR masked inputs are produced by the `maskedInput()` factory, so
        // react-refresh v0.5 cannot see them as components and warns on every
        // one. They *are* components; naming them keeps the rule live for any
        // other export added to this file.
        files: ["src/forms/masked-inputs.tsx"],
        rules: {
            "react-refresh/only-export-components": [
                "warn",
                {
                    allowConstantExport: true,
                    allowExportNames: ["CPFInput", "CNPJInput", "PhoneInput", "CEPInput"],
                },
            ],
        },
    },
    {
        // Context modules deliberately export their hook (or a small helper) next
        // to the provider: one import path per module is the SDK's public-API
        // shape, and splitting them would fragment it for no consumer gain —
        // `dist` ships prebuilt, so Fast Refresh of SDK source is moot.
        //
        // Whitelisting the exact names keeps the rule useful: a new, unintended
        // export from any of these files still warns.
        files: [
            "src/access/access-control-context.tsx",
            "src/components/ModalsManager/ModalsManager.tsx",
            "src/components/NProgress/NProgress.tsx",
            "src/components/PasswordInput/PasswordInput.tsx",
            "src/components/Toast/ToastProvider.tsx",
            "src/data/data-provider-context.tsx",
            "src/feature-flags/FeatureFlagsProvider.tsx",
            "src/i18n/I18nProvider.tsx",
            "src/router/AppRouter.tsx",
            "src/telemetry/TelemetryProvider.tsx",
            "src/theme/ThemeProvider.tsx",
        ],
        rules: {
            "react-refresh/only-export-components": [
                "warn",
                {
                    allowConstantExport: true,
                    allowExportNames: [
                        "defineRoutes",
                        "estimatePasswordStrength",
                        "nprogress",
                        "useAccessControl",
                        "useDataProvider",
                        "useFeatureFlag",
                        "useFlagValue",
                        "useI18n",
                        "useModals",
                        "useTelemetry",
                        "useTheme",
                        "useToast",
                        "useTranslate",
                    ],
                },
            ],
        },
    },
);
