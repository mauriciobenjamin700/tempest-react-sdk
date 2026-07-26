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
            // Full react-hooks v7 set, React Compiler rules included.
            ...reactHooks.configs.recommended.rules,
            /**
             * Deferred, deliberately. 19 sites across 18 files seed state from an
             * external system inside an effect (media query, storage estimate,
             * geolocation, install prompt, socket status…). Each one needs its own
             * call — derive it, move to `useSyncExternalStore`, or keep it with a
             * reason — and lumping that judgement into the same change that enabled
             * the rules would make both unreviewable. Turning the rule off here
             * keeps the deferral visible in the config instead of buried in a
             * backlog note; the follow-up flips it back to `error`.
             */
            "react-hooks/set-state-in-effect": "off",
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        /**
         * The React Compiler rules describe how a *component* must behave under
         * the compiler. Tests and the gallery are not that: a test writes to refs
         * and stubs globals precisely to simulate an environment the component
         * cannot control, and flagging that produces noise, not safety. The
         * classic pair still applies everywhere.
         */
        files: ["**/*.test.{ts,tsx}", "examples/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
        rules: {
            "react-hooks/refs": "off",
            "react-hooks/globals": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/purity": "off",
            "react-hooks/immutability": "off",
            "react-hooks/preserve-manual-memoization": "off",
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
            "src/components/Kanban/Kanban.tsx",
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
                        "applyKanbanMove",
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
