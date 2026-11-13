# Release pipeline

How `tempest-react-sdk` is published to npm and how the docs site goes live — all on the maintainer's machine, with no GitHub Actions.

!!! info "Why there is no workflow any more"
    Since 2026-11-13 the owner's rule is: GitHub Actions only in repositories of the `7rc` org. This repository is outside it, so its GitHub cost is zero — no workflow, no `gh run rerun`, no `gh workflow run`. `release-npm.yml` and `docs.yml` were **deleted**, not just disabled: a disabled workflow is one click from running again, and the tests pinning their hardening would keep vouching for code that never runs. The last version of both is in commit `2df6e4b`. What they did became two `Makefile` targets: `make release-tag` and `make docs-deploy`.

## Overview

```text
  make release TAG=X.Y.Z
  ┌──────────────────────────────┐
  │ scripts/release.sh           │
  │  1. branch release/vTAG      │
  │  2. npm version TAG          │
  │  3. closes the CHANGELOG     │
  │  4. RELEASES.md + commit     │
  │  5. make check               │
  │  6. branch push + PR         │
  └──────────────────────────────┘
       │ review + merge of the PR into main
       ▼
  make release-tag TAG=X.Y.Z
  ┌──────────────────────────────────────────────────────┐
  │ scripts/release-tag.sh                               │
  │  1. clean tree, npm whoami, gh auth status           │
  │  2. finds the merge commit on main                   │
  │  3. RELEASES.md row? does the tag exist already?     │
  │  4. ref guard + dist-tag (copies from origin/main)   │
  │  5. throwaway worktree of the commit:                │
  │     scripts/release-pack.sh (npm ci, lint, format,   │
  │     typecheck, tests, build, npm pack, 3 smokes)     │
  │  6. re-reads latest, npm publish <tarball> --tag …   │
  │  7. read-back: registry serves version and dist-tag? │
  │  8. tag push                                         │
  │  9. gh release create --verify-tag (+ tarball)       │
  └──────────────────────────────────────────────────────┘
```

**The three surfaces move together**: the git tag, the npm version and the GitHub Release. The irreversible steps — publish, tag push, Release — come last, so a refusal never leaves half a release behind. A run that stopped half-way (the registry was slow, the network dropped) resumes by running the same command again.

## Commands

A release is **two steps**, with the PR review in between:

```bash
make release TAG=0.1.5       # 1. opens the release PR (no tag, no publish)
# ... review and merge the PR into main ...
make release-tag TAG=0.1.5   # 2. build + smokes + npm publish + tag + GitHub Release
```

### `make release TAG=0.1.5`

Opens the release PR: branch `release/v0.1.5`, bump, `[Unreleased]` closed into `[0.1.5]`, `RELEASES.md` regenerated, `make check`, branch push and PR via `gh`. **Creates and pushes no tag** and publishes nothing. Needs a clean working tree and a tag that exists neither locally nor on the remote.

Blocks if `CHANGELOG.md` mentions neither `[TAG]` nor `[Unreleased]` (with a prompt to force continuing).

!!! info "The provisional `RELEASES.md` tag"
    `make releases-md` builds the table from the git tags, and the new version's row must be in the commit that gets tagged (which `test/docs-counts.test.ts` checks). The script creates a provisional local tag only for that command and deletes it right after. The new row's Commit column points at the branch's `chore: release`; the next `make releases-md` rewrites it with the real tag's commit.

### `make release TAG=0.1.5 DRY_RUN=1`

Same, but stops before the push — inspect the local branch before continuing by hand:

```bash
git push -u origin release/v0.1.5
gh pr create --base main --head release/v0.1.5 --title "chore: release v0.1.5"
# after the merge:
make release-tag TAG=0.1.5
```

### `make release-tag TAG=0.1.5`

Runs **after the merge** of the release PR, from any clean checkout of the repository: the build happens in a throwaway `git worktree` of the published commit, so your checkout is not touched. It needs `npm login` (**your** npm credential publishes) and `gh auth login` (`gh` creates the Release). Without an npm login the script stops before building anything.

1. **Credentials and tree.** `npm whoami` and `gh auth status`; clean working tree.
2. **The commit.** The **first** one in the first-parent history of `origin/main` whose `package.json` is at `0.1.5`: the merge (or squash) of the release PR. A PR merged after it, still at the same version, is left out — it is in `[Unreleased]` and cannot reach npm under a version that does not document it.
3. **Checks.** The `| v0.1.5 |` row in that commit's `RELEASES.md`. A tag that already exists — locally or on origin — must point at that same commit: on the same commit it is a **resume**; on another one, a refusal.
4. **Ref guard** (`scripts/check-release-ref.sh`) and dist-tag rule (`scripts/release-dist-tag.sh`), **copied from `origin/main`** (see [Who decides who publishes](#who-decides-who-publishes)), against the `latest` the registry serves now (`npm view`, read-only). The guard refuses a version that does not match the commit's `package.json`, a commit off `main` (#472) and a backport from a line nobody opened (#527) — before installing anything.
5. **Build and smokes** (the commit's `scripts/release-pack.sh`, in the throwaway worktree): `npm ci`, lint, format, typecheck, the suite, build, `npm pack` and the three tarball smokes — bundler + bare Node with the `node-css-loader` (`scripts/smoke-bundle.sh`), a consumer Vitest suite (`scripts/smoke-vitest.sh`) and the `tempest` bin (`scripts/smoke-cli.sh`). The suite runs again because the merge commit is another tree whenever `main` moved during the review.
6. **Publish.** `latest` is read again and the dist-tag picked again seconds before the upload; then `npm publish <tarball> --access public --tag <dist-tag>` publishes **the file** the smokes exercised, not a fresh pack — a tarball publish runs no lifecycle script. A version the registry already serves is not published again (resume) — **but only when its `dist.integrity` is the sha512 of the tested tarball**; another artifact under the same version stops everything before any tag or Release. With 2FA on npm, `npm publish` asks for the code.
7. **Read-back.** The registry serves `tempest-react-sdk@0.1.5`, its dist-tag points at it, and the served `dist.integrity` is the sha512 of the tarball the smokes exercised — when it is not, the command fails here, with no tag and no Release. The window is 30 minutes (`RELEASE_READBACK_ATTEMPTS=120` × `RELEASE_READBACK_SECONDS=15`): npm processes the upload asynchronously, and v0.76.0 took 18 minutes to show up. When the window runs out the tag is **not** pushed; run the same command once the version shows.
8. **Tag push** of `v0.1.5` on the published commit.
9. **GitHub Release.** Checks that the tag on GitHub resolves to the published commit and creates the Release with `gh release create --verify-tag` (an API call; GitHub Actions is not involved), notes from the `CHANGELOG.md` section and the tested tarball attached — steps 6 and 7 already made sure it is what npm serves. An existing Release becomes `gh release edit` + `upload --clobber`, leaving its _Latest_ mark alone.

Variables:

- `DRY_RUN=1` runs steps 1 to 5 and an `npm publish --dry-run`; it creates no tag, publishes nothing, creates no Release, and needs no login.
- `REF=<sha>` publishes a specific commit, for when `main` already moved to another version. It must be on `main` and carry the right version.
- `BASE_BRANCH=release-0.75` and `BACKPORT_LINES=release-0.75` publish a backport (see [Dist-tags](#dist-tags)).

!!! warning "No provenance"
    Provenance (npm's _Verified provenance_ badge) needs the OIDC identity of a CI runner, which does not exist on a local machine. Versions up to v0.82.0 shipped with provenance; the ones `make release-tag` publishes ship without. Provenance is now checked through the GitHub Release: it points at the tag's commit and attaches the tarball whose sha512 is npm's `dist.integrity`.

### `make release TAG=0.1.5 SKIP_VALIDATE=1`

Skips the local `make check` — the only place budgets, coverage and the gallery e2e run. `make release-tag` still runs lint, format, typecheck, tests, build and the smokes before publishing, but not `size-limit` nor the e2e. Emergencies only.

### `make validate`

A fast subset of `make check`, with no release.

### `make publish`

**Refuses and exits 1** (#532). A bare `npm publish` skips the ref guard, the check against `main`, the tarball smokes, the read-back and the GitHub Release. Publishing goes through `make release-tag` only. `make publish-dry` stays: it runs `npm publish --dry-run` and publishes nothing.

### `make docs-deploy`

Publishes the MkDocs site to GitHub Pages from the local machine (`scripts/docs-deploy.sh`):

1. fetches `origin/main` and opens a throwaway worktree of it — the site is always `main`'s, never your checkout's;
2. creates a throwaway venv with `uv` and installs `docs/requirements.txt` with `--require-hashes` (#532): every dependency's version and hash pinned;
3. `node scripts/gen-llms.mjs` and `mkdocs build --strict`;
4. checks both languages were built (`index.html` and `en/index.html`);
5. pushes **that** directory to the `gh-pages` branch with the same venv's `ghp-import`. Not `mkdocs gh-deploy`, which would build a second time;
6. reads the Pages configuration (`gh api`, read-only) and warns when it does not serve `gh-pages` yet.

`DRY_RUN=1 make docs-deploy` stops after step 4. Measured on 2026-11-13: the dry-run build takes ~13 s with a warm `uv` cache and produces the pages of both languages (`time DRY_RUN=1 make docs-deploy`).

A docs-only change is still a `docs:` commit straight to `main`; the site changes when someone runs `make docs-deploy`, not on push.

### `make releases`

Lists every `v*.*.*` tag sorted by version (newest first).

### `make releases-md`

Regenerates `RELEASES.md` from the git tags. Called by `scripts/release.sh`, with a provisional local tag of the new version that is deleted right after.

### `make releases-check`

Sync report of the three surfaces — one line per git tag, saying whether the version is on npm and whether the tag has a GitHub Release:

```text
TAG          NPM      RELEASE  STATUS
v0.24.0      ok       ok       sincronizado
v0.23.0      ok       FALTA    DESSINCRONIZADO
```

Read-only, always safe. Use it before and after a release.

### `make releases-sync` / `make releases-sync-dry`

Creates the **missing GitHub Releases** for tags that already exist (backfill), with notes from the matching `CHANGELOG.md` section. Tags that already have a Release are skipped — the script is idempotent and never rewrites an existing Release.

```bash
make releases-sync-dry   # lists what it would do, creates nothing
make releases-sync       # creates for real
```

!!! info "Backfill notes never inherit `[Unreleased]`"
    `scripts/changelog.mjs notes <version>` falls back to the `[Unreleased]` block only with `--allow-unreleased` (which `make release-tag` passes, for a release cut before its section was dated). The backfill does **not** pass it — so an old tag never gets the next cycle's notes.

## Dist-tags

`latest` is **monotonic**: it only moves forward. The rule lives in one script, `scripts/release-dist-tag.sh`, called by the guard, right before `npm publish` and when marking the GitHub Release.

| Version                                           | Dist-tag                   | Example, with `latest` at `0.77.0` |
| ------------------------------------------------- | -------------------------- | ---------------------------------- |
| prerelease (`X.Y.Z-something`)                    | `next`                     | `v0.78.0-rc.1` → `next`            |
| stable, above `latest` (or no `latest`)           | `latest`                   | `v0.78.0` → `latest`               |
| stable, equal to `latest` (resume)                | `latest`                   | `v0.77.0` → `latest`               |
| stable, below `latest`                            | `release-<major>.<minor>`  | `v0.75.1` → `release-0.75`         |

Whoever wants the old line installs it by its dist-tag: `npm install tempest-react-sdk@release-0.75`.

How `latest` is read:

- **Through `npm view <package> dist-tags --json`**, with the key extracted in Node. Never `npm view <package> dist-tags.<name>`: npm takes the dot as a path, and `dist-tags.release-0.75` always comes back empty.
- **Only an explicit `E404` is a new package** (no `latest`). An empty answer with exit 0, or a package that exists without `latest`, **fails** — reading that as a new package would send a backport to `latest`. Other `npm view` failures are retried 10 times, 15 s apart.

!!! info "Why `release-0.75` and not `v0.75`"
    npm refuses a dist-tag that is a valid semver range, and `v0.75` is one (`>=0.75.0 <0.76.0-0`): `npm publish --tag v0.75` exits with `Tag name must not be a valid SemVer range: v0.75` (measured on npm 12.2.0).

!!! note "Where a backport may come from"
    A commit off `main` publishes only if it is an ancestor of `origin/release-<major>.<minor>` — the maintenance branch of its own line —, if the picked dist-tag is that `release-<major>.<minor>` **and** if the line is opened **for this run** (#527): `make release-tag TAG=0.75.1 BASE_BRANCH=release-0.75 BACKPORT_LINES=release-0.75`. Creating the branch opens nothing. A maintenance branch never publishes to `latest` or `next`: those come from `main` only.

The **GitHub Release** follows the registry: `--latest` when npm's `latest` **is** this version, `--latest=false` otherwise (backport, or a prerelease, which also gets `--prerelease`).

`test/release-workflow.test.ts` exercises all of this in a fixture: a local bare `origin`, a fake `npm` and a fake `gh` first on the `PATH`, and a stub `release-pack.sh` in the commit — no network and no registry.

## Who decides who publishes

Up to v0.82.0, pushing a `v*` tag triggered the publish, and the question of issues #472 and #527 was "does whoever can push a tag publish?" — the answer hung on GitHub environments, the Trusted Publisher and rulesets. **Since the publish left GitHub Actions, a tag publishes nothing.** Publishing takes the npm credential of a package maintainer, on the machine of whoever runs `make release-tag`.

The ref guard still stops **mistakes**: a commit off `main`, a version that does not match, a backport from a line nobody opened. It runs from the copy on `origin/main`, not from the published commit (#527): in a fixture, a commit that rewrote its own `check-release-ref.sh` to approve everything is refused. But it is not an authorization boundary — whoever holds the npm credential can run `npm publish` by hand. The boundary is the npm account.

### Repository owner checklist

State read on 2026-11-13, read-only (`gh api repos/mauriciobenjamin700/tempest-react-sdk/pages`, `…/environments`, `…/actions/secrets`, `…/actions/permissions`). None of it is configured from the repository:

| # | Where | What to do | State on 2026-11-13 |
| - | ----- | ---------- | ------------------- |
| 1 | _Settings → Pages → Source_ | **Deploy from a branch → `gh-pages` / (root)**, after the first `make docs-deploy` (the branch must exist first). Or: `gh api -X PUT repos/mauriciobenjamin700/tempest-react-sdk/pages -f build_type=legacy -f 'source[branch]=gh-pages' -f 'source[path]=/'` | `build_type: workflow` — the live site is frozen at the last `docs.yml` run |
| 2 | npmjs.com → account | 2FA in _Authorization and writes_ mode: `npm publish` asks for the code, and a leaked session token alone does not publish | not observable from here |
| 3 | npmjs.com → `tempest-react-sdk` → _Settings → Trusted Publisher_ | **remove** the entry pointing at `release-npm.yml`: no workflow publishes any more, and it only serves to reopen a publish path through Actions | configured since 0.7.0 |
| 4 | _Settings → Secrets and variables → Actions_ and _Environments_ | delete the `NPM_TOKEN` secret, the `NPM_TOKEN`, `npm-release` and `github-pages` environments, the `RELEASE_BACKPORT_LINES` variable if present, and revoke the token on npmjs.com | the `NPM_TOKEN` secret and the three environments **exist** |
| 5 | _Settings → Actions → General_ | **Disable actions**: the rule is then enforced by GitHub, not by convention | `enabled: true`, `allowed_actions: all` |
| 6 | _Settings → Rules → Rulesets_, targeting `main` and `release-*` | required PR, block _force push_ and _deletion_ — what makes "is on `main`" mean "was reviewed" | `main` unprotected |

!!! warning "The maintainer's machine is now the perimeter"
    With no runner, nothing separates the code that installs dependencies from the credential that publishes: the `npm ci` of `make check` and `make release-tag` runs on the same machine where `npm login` stored the token. Prefer a session login (`npm login`) over a long-lived automation token in `~/.npmrc`, and let 2FA ask for the code on publish (item 2).

## History

See [`RELEASES.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/RELEASES.md) (generated by `make releases-md`) and [`CHANGELOG.md`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/CHANGELOG.md) (hand-written before each release).

## See also

- [`Makefile`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/Makefile) — target definitions
- [`scripts/release.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release.sh) — opens the release PR
- [`scripts/release-tag.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/release-tag.sh) — publishes
- [`scripts/docs-deploy.sh`](https://github.com/mauriciobenjamin700/tempest-react-sdk/blob/main/scripts/docs-deploy.sh) — site to `gh-pages`
