#!/usr/bin/env node
// @ts-check

/**
 * Write `dist/pcm-worklet.js`, the `AudioWorklet` module behind
 * `createPcmStream`, as a real file of the package.
 *
 * By default the stream loads the module from an inline `blob:` URL, but a
 * worklet follows `script-src`, and the CSP `tempestCsp()` generates
 * (`script-src 'self' 'wasm-unsafe-eval'`) refuses `blob:` — measured on
 * Chromium 159, the load fails with an `AbortError` that names nothing. A file
 * served from the app's own origin passes, so the package ships one:
 * `import url from "tempest-react-sdk/pcm-worklet.js?url"`.
 *
 * The text comes from the built `pcmWorkletSource()`, the same function the
 * inline path uses, so the two can never drift.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { pcmWorkletSource } = await import(pathToFileURL(join(DIST, "audio", "pcm-stream.js")).href);
const text = pcmWorkletSource();
writeFileSync(join(DIST, "pcm-worklet.js"), text);
console.log(`write-pcm-worklet: dist/pcm-worklet.js (${text.length} bytes)`);
