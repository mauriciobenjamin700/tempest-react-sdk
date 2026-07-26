declare module "*.module.css" {
    const classes: { readonly [key: string]: string };
    export default classes;
}

declare module "*.css";

/**
 * The one `import.meta.env` field the SDK reads, declared narrowly instead of
 * pulling in `vite/client`.
 *
 * `vite/client` would also add global asset-module declarations and a full
 * `ImportMetaEnv`, which the SDK does not want: it also runs where Vite never
 * touched the code (a service-worker context, the Node test runner, a build-time
 * script), so every read is guarded and `env` itself is optional here.
 */
interface ImportMeta {
    readonly env?: { readonly DEV?: boolean };
}
