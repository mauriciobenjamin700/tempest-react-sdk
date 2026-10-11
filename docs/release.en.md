# Release pipeline

How `tempest-react-sdk` is published to npm — an automatic tag-push workflow,
with a manual fallback.

## Overview

```text
Local:                                  GitHub Actions:
  make release TAG=X.Y.Z
       │
       ▼
  ┌─────────────────────────┐
  │ scripts/release.sh:     │
  │  1. branch release/vTAG │
  │  2. npm version TAG     │
  │  3. close the CHANGELOG │
  │     ([Unreleased] →     │
  │      [TAG] — date)      │
  │  4. validate (lint +    │
  │     format + typecheck  │
  │     + test + build)     │
  │  5. commit + tag local  │
  │  6. push branch + tag   │──────────► tag push triggers
  │  7. open PR via gh      │            .github/workflows/release-npm.yml
  └─────────────────────────┘                     │
                                                  ▼
                                       ┌────────────────────────────┐
                                       │ build (contents: read)     │
                                       │ 1. Checkout @ tag          │
                                       │ 2. tag == package.json?    │
                                       │ 3. npm ci + lint + format  │
                                       │ 4. Typecheck + tests       │
                                       │ 5. Build + npm pack        │
                                       │ smoke (contents: read)     │
                                       │ 6. Bundler, bare Node and  │
                                       │    Vitest on the tarball   │
                                       │ publish (id-token: write)  │
                                       │ 7. npm publish <tarball>   │
                                       │    --provenance            │
                                       │ 8. read-back: does the     │
                                       │    registry serve it as    │
                                       │    dist-tag latest?        │
                                       │ release (contents: write)  │
                                       │ 9. GitHub Release for the  │
                                       │    tag (notes = CHANGELOG, │
                                       │    tarball attached)       │
                                       └────────────────────────────┘
```

**The three surfaces move together**: the git tag, the npm version and the GitHub
Release. The workflow fails when the tag does not describe the `package.json`
version, and fails when the registry is not serving that version as `latest` — so
"green workflow" really does mean "published and visible".

A `vX.Y.Z` tag is the **only** thing that publishes — a manual dispatch runs on the tag too, never on a branch. There is no "publish via PR merge" —
merging the release PR is only to sync `main` with the updated `package.json` +
`RELEASES.md`.

## Commands

### `make release TAG=0.1.5`

The full pipeline. Requires a clean working tree + a tag that doesn't exist
locally/remotely.

It blocks if `CHANGELOG.md` doesn't mention `[TAG]` or `[Unreleased]` (with a
prompt to force continuation).

### `make release TAG=0.1.5 DRY_RUN=1`

Identical, but stops before the push — you inspect the local branch and tag
before continuing manually:

```bash
git push -u origin release/v0.1.5
git push origin v0.1.5
gh pr create --base main --head release/v0.1.5 --title "chore: release v0.1.5"
```

### `make release TAG=0.1.5 SKIP_VALIDATE=1`

Skips local validation (`npm ci`, lint, format-check, typecheck, test, build,
pack dry-run). Use it only in emergencies — CI will validate again from scratch.

### `make validate`

Runs all local validation without releasing. Equivalent to the CI validation
block.

### `make publish`

The manual fallback. Requires `NPM_TOKEN` in `~/.npmrc` (a token with 2FA bypass)
or an interactive `npm login`. **It does not trigger the workflow** — it's a
direct publish.

```bash
npm config set //registry.npmjs.org/:_authToken=npm_xxx... --location=user
npm run build
make publish
```

Without a 2FA-bypass token, npm requires an OTP:

```bash
npm publish --access public --otp=123456
```

### `make releases`

Lists every `v*.*.*` tag ordered by version (most recent first).

### `make releases-md`

Regenerates `RELEASES.md` from the git tags. Called automatically by
`scripts/release.sh` after creating the tag.

### `make releases-check`

A sync report across the three surfaces — one line per git tag, telling you whether the version exists on npm and whether the tag has a GitHub Release:

```text
TAG          NPM      RELEASE  STATUS
v0.24.0      ok       ok       sincronizado
v0.23.0      ok       FALTA    DESSINCRONIZADO
```

Read-only, always safe to run. Use it before and after a release.

### `make releases-sync` / `make releases-sync-dry`

Creates the **missing GitHub Releases** for tags that already exist (backfill), with the notes taken from the matching `CHANGELOG.md` section. Tags that already have a Release are skipped — the script is idempotent and never rewrites an existing Release.

```bash
make releases-sync-dry   # list what it would create, without creating anything
make releases-sync       # actually create them
```

Needed because publishing to npm and cutting the Release only started moving together in v0.24.0: earlier tags existed in git and on npm, but with no GitHub Release.

!!! info "Backfilled notes never inherit `[Unreleased]`"
    `scripts/changelog.mjs notes <version>` only falls back to the `[Unreleased]` block when given `--allow-unreleased` (which the workflow does, for a release cut before the section was dated). The backfill does **not** pass the flag — so an old tag never gets the next cycle's notes; with no section, the Release ships a pointer to `CHANGELOG.md`.

## CI workflow (`.github/workflows/release-npm.yml`)

Triggered by:

- **`push: tags: [v*.*.*]`** — the main flow. `make release TAG=X` pushes a tag and the workflow fires automatically.
- **`workflow_dispatch`** — manual, **always on the tag**: `gh workflow run release-npm.yml --ref vX.Y.Z`. Useful when a tag's publish failed and you want to re-run without bumping the version. Dispatched from a branch (`--ref main`), the step 3 guard fails the run before anything is installed — up to 0.76.0 it derived the tag from the branch's `package.json` and published that tree.

The workflow starts from `permissions: {}`, queues runs of the same tag (`concurrency` per ref, never cancelling the one in progress — its publish may already have happened) and is split into four jobs, each holding only the permission it needs. The split is the point: the only job that **can** publish runs nothing resolved from the registry at release time.

| Job       | Permission        | What it runs                                                          |
| --------- | ----------------- | --------------------------------------------------------------------- |
| `build`   | `contents: read`  | version guard, `npm ci`, lint, format, typecheck, tests, build, `npm pack` |
| `smoke`   | `contents: read`  | the three tarball smokes, with the consumer's floating installs       |
| `publish` | `id-token: write` (environment `npm-release`) | pinned npm CLI + `npm publish` of the smoked tarball + read-back      |
| `release` | `contents: write` | the GitHub Release, installing nothing                                |

Steps, in order:

1. **Checkout** (`actions/checkout`, pinned by SHA like every action in the workflow) with `fetch-depth: 0` and `persist-credentials: false` — the `GITHUB_TOKEN` is not left in `.git/config` for later steps.
2. **Node 22** + npm cache.
3. **Ref guard** (`scripts/check-release-ref.sh`) — **aborts**, before anything is installed, when the run's ref is not a `vX.Y.Z` (or `vX.Y.Z-pre`) tag, when the tag does not describe `package.json`'s `version`, or when it does not point at the checked-out commit (`GITHUB_SHA`). It applies to tag pushes and to `workflow_dispatch` alike. It also derives `prerelease` (a version containing `-`) so the Release is marked correctly.
4. **`npm ci`**, **lint**, **format check**, **typecheck**, **tests** and **build**.
5. **`npm pack`** — the tarball is uploaded as an `npm-tarball-<attempt>` artifact (one name per `run_attempt`, so a full re-run does not collide with the first attempt's artifact) and its SHA-256 becomes a job output. A later job cannot rewrite a job output, so every job that downloads the artifact checks the digest before using it (`sha256sum --check`).
6. **Smoke** (`smoke` job) — installs the tarball in `/tmp/sdk-smoke` with `react@^19 react-dom@^19 react-router@^8` and bundles it with esbuild, runs the same assertions in bare Node with the published `node-css-loader`, and runs a consumer Vitest suite (`scripts/smoke-vitest.sh`). Those installs resolve floating versions from the registry — which is why they live in a job with no write permission at all.
7. **`npm publish "./<tarball>" --provenance --access public`** (`publish` job) via **Trusted Publishing (OIDC)** — no `NPM_TOKEN`. It publishes **the file** `build` packed and `smoke` tested: a directory publish would re-run `prepublishOnly` (typecheck + lint + the whole suite + build) inside the `id-token` job and ship a fresh pack instead of the tested one; a tarball publish runs no lifecycle script at all. A prerelease (`vX.Y.Z-rc.1`) goes out with `--tag next`, a stable version with `--tag latest` — before, a published `-rc` would become the default of every `npm install`. The npm CLI is installed at an exact version (`npm install -g npm@12.2.0`), not `@latest`.
8. **Registry read-back** — confirms npm serves `tempest-react-sdk@<version>` (up to 30 minutes, since the registry processes the upload asynchronously) **and** that its dist-tag (`latest`, or `next` for a prerelease) points at it — with the same 30-minute window, because the dist-tag lags as much as the version. Fails the job otherwise: a publish that landed under a different tag would no longer look green.
9. **GitHub Release** (`release` job) — `gh release create <tag>` with the artifact's tarball attached and the notes extracted from the `CHANGELOG.md` section (`scripts/changelog.mjs notes <version> --allow-unreleased`), plus a link to the npm version. First it checks that the tag still resolves to the published `GITHUB_SHA` and that the tarball's sha512 is the `dist.integrity` npm serves (read with the same 30-minute window); `gh release create` gets `--verify-tag`, so it never creates a missing tag at the default branch's HEAD. When the Release already exists it does `gh release edit` + `upload --clobber` instead of failing — and `--clobber` can only re-upload the bytes npm serves. To recover a run that published and failed afterwards, use **Re-run failed jobs**: the re-run jobs inherit the `build` outputs and download the artifact of the attempt that published. A **Re-run all jobs** works too (the artifact has its own name), but it repacks — and if the new pack is not byte-identical to the published one, the `release` job attaches nothing and fails, pointing at `make releases-sync` (creates the Release with no asset) or at attaching the registry's own tarball by hand (`npm pack tempest-react-sdk@<version>`).

!!! note "Why npm is pinned to 12.2.0"
    Trusted Publishing needs npm >= 11.5.1, and Node 22 ships 10.x. Up to 0.76.0 the step installed `npm@latest`, and `latest` changed major twice under the job without anyone choosing it: the run logs from v0.74.0 to v0.76.0 show npm 12 (`npm notice run …`, `allowScripts`). 12.2.0 is the version that published those three releases. Bumping npm is a deliberate change to that line, reviewed like any other.

### The `npm-release` environment

The `publish` job runs in the `npm-release` environment. Unconfigured, GitHub creates it empty and it gates nothing — the workflow behaves the same. It is the hook for two controls that live outside the repository, and that are worth having:

- **In Settings → Environments → `npm-release`**: _Required reviewers_ (the publish waits for a human approval, even after every gate is green) and _Deployment branches and tags_ restricted to `v*` tags.
- **On the npmjs.com Trusted Publisher**: the _Environment_ field set to `npm-release`. From then on npm only accepts the OIDC exchange from a job in that environment — another workflow, or another job in the same file, cannot publish.

!!! tip "Turn both on together"
    A required reviewer without the npm binding lets a job outside the environment publish; the binding without a reviewer lets any run in the environment publish with nobody looking.

## Secrets needed on GitHub

**None.** Publishing uses npm **Trusted Publishing**: `npm publish` exchanges the GitHub Actions OIDC identity for a short-lived token, so there is no `NPM_TOKEN` in the repository. What must exist is a **Trusted Publisher** on npmjs.com pointing at this repo + the `release-npm.yml` file.

The `GITHUB_TOKEN` used to cut the Release is provided automatically by the Actions runtime — only the job's `permissions: contents: write` needs declaring, and it is.

!!! warning "`NPM_TOKEN` is still the local fallback's business"
    `make publish` publishes from your machine and does need a token in `~/.npmrc` (Classic Automation, or Granular with "Allow bypass 2FA" checked). That path produces **no** provenance and **no** GitHub Release — if you use the fallback, run `make releases-sync` afterwards so the Release is not left missing.

`GITHUB_TOKEN` is provided automatically by the Actions runtime.

## Provenance signing

The publish includes `--provenance` when run in CI. This requires:

- `permissions: id-token: write` in the workflow (already configured).
- npm >= 11.5.1 on the runner (the `publish` job installs 12.2.0, pinned).
- A Trusted Publisher configured on npmjs.com for this repository.

The result: every published version carries an attestation signed by sigstore,
linking the tarball to the commit + workflow run that produced it. Visible on the
[registry](https://www.npmjs.com/package/tempest-react-sdk) as a "Verified
provenance" badge.

A local manual publish **cannot** get provenance — there's no OIDC provider
outside CI. `make publish` always runs without `--provenance`.

## History

See [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) (auto-generated via `make releases-md`) and [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) (written by hand before each release).

## See also

- [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) — change log per version
- [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) — tag table with date and commit
- [`Makefile`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/Makefile) — target definitions
- [`scripts/release.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release.sh) — the pipeline bash script
