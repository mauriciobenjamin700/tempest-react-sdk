#!/usr/bin/env bash
# scripts/release-tag.sh — publica a release DEPOIS do merge do PR (#472).
#
# Uso:
#   scripts/release-tag.sh <TAG>
#
# Variáveis de ambiente:
#   DRY_RUN=1         roda guard, build, pack, smokes e `npm publish --dry-run`;
#                     não cria tag, não publica, não cria GitHub Release
#   BASE_BRANCH=main  branch onde o PR de release foi mergeado (default: main)
#   REF=<sha>         publica este commit em vez de procurar o do merge; ele
#                     precisa estar na BASE_BRANCH e ter a versão TAG
#   BACKPORT_LINES=   linhas de backport abertas para esta run, por exemplo
#                     `release-0.75` (veja scripts/check-release-ref.sh)
#   RELEASE_READBACK_ATTEMPTS=120 / RELEASE_READBACK_SECONDS=15
#                     janela do read-back do registry (30 min por padrão)
#
# Desde 2026-11-13 o repositório não usa GitHub Actions (regra do dono: Actions só
# em repositório da org `7rc`). Este script faz, na máquina de quem publica, o que
# o `release-npm.yml` fazia depois do push da tag, na mesma ordem, e com os
# passos irreversíveis por último:
#
#  1. confere ferramentas, working tree limpo e as credenciais: `npm whoami` e
#     `gh auth status`. Sem login no npm o script para aqui, antes de qualquer
#     build (no DRY_RUN só avisa, porque `npm publish --dry-run` não autentica);
#  2. escolhe o commit: o **primeiro** da história first-parent de
#     `origin/<BASE_BRANCH>` cujo `package.json` tem a versão TAG — o merge (ou o
#     squash) do PR de release. PRs mergeados depois dele, ainda na mesma versão,
#     ficam de fora: estão no `[Unreleased]` e não podem ir para o npm sob a
#     versão que não os documenta. Com a ponta já em outra versão, pede `REF=`;
#  3. confere a linha `| vTAG |` no `RELEASES.md` desse commit e que a tag, se já
#     existe (local ou no origin), aponta para ele — tag no mesmo commit é
#     retomada de uma run que parou no meio, tag em outro commit reprova;
#  4. roda o guard de ref (`check-release-ref.sh`) e a regra do dist-tag
#     (`release-dist-tag.sh`) **copiados de `origin/main`**, nunca os do commit
#     publicado (#527), contra o `latest` lido do registry (`npm view`, só
#     leitura);
#  5. num `git worktree` descartável do commit, roda `scripts/release-pack.sh`
#     daquele commit: `npm ci`, lint, format, typecheck, testes, build,
#     `npm pack` e os três smokes do tarball;
#  6. relê o `latest` e escolhe o dist-tag de novo logo antes do upload, e roda
#     `npm publish <tarball> --access public --tag <dist-tag>` com a credencial
#     npm local. Sem `--provenance`: provenance exige o OIDC de um runner de CI,
#     e não existe fora dele. Versão que o registry já serve não é publicada de
#     novo (é a retomada);
#  7. read-back: o registry serve a versão, e o dist-tag dela aponta para ela;
#  8. push da tag;
#  9. GitHub Release com `gh release create --verify-tag` (chamada de API, não
#     Actions), notas da seção do CHANGELOG e o tarball anexado só quando o
#     sha512 dele é o `dist.integrity` que o npm serve.

set -euo pipefail

TAG="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
BASE_BRANCH="${BASE_BRANCH:-main}"
REF="${REF:-}"
BACKPORT_LINES="${BACKPORT_LINES:-}"
READBACK_ATTEMPTS="${RELEASE_READBACK_ATTEMPTS:-120}"
READBACK_SECONDS="${RELEASE_READBACK_SECONDS:-15}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ -z "$TAG" ]]; then
  echo "Uso: $0 <TAG>   (DRY_RUN=1, BASE_BRANCH=main, REF=<sha>, BACKPORT_LINES=release-X.Y)"
  exit 1
fi

if ! [[ "$TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9]+)*$ ]]; then
  fail "TAG inválido '$TAG' — esperado formato semver (ex.: 0.1.1, 1.0.0-rc1)"
fi

GIT_TAG="v$TAG"
BASE_REF="refs/remotes/origin/$BASE_BRANCH"

for tool in git node npm gh; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool não encontrado no PATH"
done

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short >&2
  fail "working tree sujo — comite ou guarde as mudanças antes de publicar"
fi

if NPM_USER=$(npm whoami 2>/dev/null) && [[ -n "$NPM_USER" ]]; then
  echo "→ npm: autenticado como $NPM_USER"
elif [[ "$DRY_RUN" == "1" ]]; then
  echo "· npm: sem login (DRY_RUN segue; o publish de verdade pede \`npm login\`)"
else
  fail "npm sem login (\`npm whoami\` falhou). Publicar usa a sua credencial npm: rode \`npm login\` e tente de novo."
fi
if [[ "$DRY_RUN" != "1" ]] && ! gh auth status >/dev/null 2>&1; then
  fail "gh sem login (\`gh auth status\` falhou). O GitHub Release sai pelo gh: rode \`gh auth login\`."
fi

version_at() {
  git show "$1:package.json" | node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>process.stdout.write(String(JSON.parse(s).version)))'
}

field_at() {
  git show "$1:package.json" | node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>process.stdout.write(String(JSON.parse(s)[process.argv[1]])))' "$2"
}

sha512_of() {
  node -e 'const c=require("crypto");process.stdout.write("sha512-"+c.createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "$1"
}

remote_tag_commit() {
  local lines peeled plain
  lines=$(git ls-remote origin "refs/tags/$GIT_TAG" "refs/tags/$GIT_TAG^{}")
  peeled=$(awk -v r="refs/tags/$GIT_TAG^{}" '$2 == r { print $1 }' <<<"$lines")
  plain=$(awk -v r="refs/tags/$GIT_TAG" '$2 == r { print $1 }' <<<"$lines")
  printf "%s" "${peeled:-$plain}"
}

echo "→ Buscando origin/$BASE_BRANCH e origin/main"
FETCH=("+refs/heads/main:refs/remotes/origin/main")
if [[ "$BASE_BRANCH" != "main" ]]; then
  FETCH+=("+refs/heads/$BASE_BRANCH:$BASE_REF")
fi
git fetch --quiet --no-tags origin "${FETCH[@]}"

if [[ -n "$REF" ]]; then
  TARGET=$(git rev-parse --verify --quiet "$REF^{commit}" || true)
  [[ -n "$TARGET" ]] || fail "REF '$REF' não é um commit"
  if ! git merge-base --is-ancestor "$TARGET" "$BASE_REF"; then
    fail "$TARGET não está em origin/$BASE_BRANCH — mergeie o PR de release antes de publicar"
  fi
  if [[ "$(version_at "$TARGET")" != "$TAG" ]]; then
    fail "package.json em $TARGET está em $(version_at "$TARGET"), não em $TAG"
  fi
else
  TARGET=""
  for sha in $(git rev-list --first-parent "$BASE_REF"); do
    if [[ "$(version_at "$sha")" != "$TAG" ]]; then
      break
    fi
    TARGET="$sha"
  done
  if [[ -z "$TARGET" ]]; then
    echo "ERROR: origin/$BASE_BRANCH está em $(version_at "$BASE_REF"), não em $TAG." >&2
    echo "       O PR de release (release/$GIT_TAG) já foi mergeado? Se a $BASE_BRANCH já" >&2
    echo "       andou para outra versão, aponte o commit do merge com REF=<sha>." >&2
    exit 1
  fi
fi

if ! git show "$TARGET:RELEASES.md" 2>/dev/null | grep -qE "^\| ${GIT_TAG//./\\.} +\|"; then
  fail "RELEASES.md em $TARGET não tem a linha de $GIT_TAG — o commit não veio do scripts/release.sh"
fi

LOCAL_TAG=$(git rev-parse --verify --quiet "refs/tags/$GIT_TAG^{commit}" || true)
if [[ -n "$LOCAL_TAG" && "$LOCAL_TAG" != "$TARGET" ]]; then
  fail "tag $GIT_TAG já existe localmente em $LOCAL_TAG, não em $TARGET"
fi
REMOTE_TAG=$(remote_tag_commit)
if [[ -n "$REMOTE_TAG" && "$REMOTE_TAG" != "$TARGET" ]]; then
  fail "tag $GIT_TAG já existe no origin em $REMOTE_TAG, não em $TARGET"
fi
if [[ -n "$REMOTE_TAG" ]]; then
  echo "· $GIT_TAG já está no origin neste commit: retomando a publicação"
fi

echo "→ $GIT_TAG → $(git log -1 --format='%h %s' "$TARGET")"

PKG_NAME=$(field_at "$TARGET" name)
WORK=$(mktemp -d)
TREE="$WORK/tree"
cleanup() {
  git worktree remove --force "$TREE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/guard"
git show refs/remotes/origin/main:scripts/check-release-ref.sh >"$WORK/guard/check-release-ref.sh"
git show refs/remotes/origin/main:scripts/release-dist-tag.sh >"$WORK/guard/release-dist-tag.sh"
DIST_TAG_SCRIPT="$WORK/guard/release-dist-tag.sh"

echo "→ Lendo o latest de $PKG_NAME no registry"
CURRENT_LATEST=$(bash "$DIST_TAG_SCRIPT" current-latest "$PKG_NAME")
echo "→ Guard de ref (cópia de origin/main)"
GUARD_OUT=$(RELEASE_TAG="$GIT_TAG" RELEASE_SHA="$TARGET" CURRENT_LATEST="$CURRENT_LATEST" \
  BACKPORT_LINES="$BACKPORT_LINES" bash "$WORK/guard/check-release-ref.sh")
DIST_TAG=$(sed -n 's/^dist_tag=//p' <<<"$GUARD_OUT")
PRERELEASE=$(sed -n 's/^prerelease=//p' <<<"$GUARD_OUT")

echo "→ Worktree descartável de $TARGET"
git worktree add --quiet --detach "$TREE" "$TARGET"
(cd "$TREE" && bash scripts/release-pack.sh "$WORK/pack")
mapfile -t TARBALLS < <(find "$WORK/pack" -maxdepth 1 -name '*.tgz')
[[ ${#TARBALLS[@]} -eq 1 ]] || fail "o pack deixou ${#TARBALLS[@]} tarballs, esperado 1"
TARBALL="${TARBALLS[0]}"
INTEGRITY=$(sha512_of "$TARBALL")
echo "→ Tarball: $(basename "$TARBALL") ($INTEGRITY)"

# Falha fechado quando o npm serve, sob esta versão, um artefato que não é o
# tarball que acabou de passar pelos smokes: numa retomada (outra pessoa ou outra
# máquina publicou a versão) ou depois do publish. Roda antes de qualquer tag ou
# GitHub Release, que sem provenance são a única atestação de que o pacote no
# registry é o que saiu deste commit (achado 1 da auditoria run-9).
require_registry_integrity() {
  local served
  served=$(npm view --prefer-online "$PKG_NAME@$TAG" dist.integrity 2>/dev/null || true)
  if [[ "$served" != "$INTEGRITY" ]]; then
    fail "o npm serve $PKG_NAME@$TAG com integridade '$served', mas o tarball testado é '$INTEGRITY'. Nenhuma tag nem Release foi criada. Isso indica uma publicação que não saiu deste fluxo: investigue (npm view $PKG_NAME@$TAG, npm access, tokens da conta) antes de qualquer outra coisa — não anexe o tarball do registry."
  fi
}

PUBLISHED_NOW=false
SERVED=$(npm view --prefer-online "$PKG_NAME@$TAG" version 2>/dev/null || true)
if [[ "$SERVED" == "$TAG" ]]; then
  echo "· $PKG_NAME@$TAG já está no registry — o publish é pulado (retomada)"
  require_registry_integrity
else
  LATEST_NOW=$(bash "$DIST_TAG_SCRIPT" current-latest "$PKG_NAME")
  PICKED=$(bash "$DIST_TAG_SCRIPT" pick "$TAG" "$LATEST_NOW")
  if [[ "$PICKED" != "$DIST_TAG" ]]; then
    echo "· o latest do registry mudou para '$LATEST_NOW' desde o guard: publicando sob $PICKED, não $DIST_TAG"
    DIST_TAG="$PICKED"
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    npm publish "$TARBALL" --dry-run --access public --tag "$DIST_TAG"
  else
    echo "→ npm publish $(basename "$TARBALL") --tag $DIST_TAG (sem provenance: publish local)"
    npm publish "$TARBALL" --access public --tag "$DIST_TAG"
    PUBLISHED_NOW=true
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "✓ DRY_RUN — guard, build, pack e smokes verdes; nada foi publicado, nenhuma tag criada."
  echo "  Commit: $TARGET · dist-tag: $DIST_TAG · para publicar: make release-tag TAG=$TAG"
  exit 0
fi

echo "→ Read-back: o registry serve $PKG_NAME@$TAG?"
SERVED=""
for attempt in $(seq 1 "$READBACK_ATTEMPTS"); do
  SERVED=$(npm view --prefer-online "$PKG_NAME@$TAG" version 2>/dev/null || true)
  [[ "$SERVED" == "$TAG" ]] && break
  echo "· o registry ainda não serve $TAG (tentativa $attempt/$READBACK_ATTEMPTS); de novo em ${READBACK_SECONDS}s"
  sleep "$READBACK_SECONDS"
done
if [[ "$SERVED" != "$TAG" ]]; then
  fail "o npm ainda não serve $PKG_NAME@$TAG depois de $READBACK_ATTEMPTS tentativas. O upload aconteceu: quando a versão aparecer em https://www.npmjs.com/package/$PKG_NAME, rode de novo \`make release-tag TAG=$TAG\` — a retomada pula o publish e termina tag e Release."
fi
if [[ "$PUBLISHED_NOW" == "true" ]]; then
  TAGGED=""
  for attempt in $(seq 1 "$READBACK_ATTEMPTS"); do
    TAGGED=$(bash "$DIST_TAG_SCRIPT" get "$PKG_NAME" "$DIST_TAG")
    [[ "$TAGGED" == "$TAG" ]] && break
    echo "· dist-tag $DIST_TAG ainda é '$TAGGED' (tentativa $attempt/$READBACK_ATTEMPTS); de novo em ${READBACK_SECONDS}s"
    sleep "$READBACK_SECONDS"
  done
  [[ "$TAGGED" == "$TAG" ]] || fail "dist-tag $DIST_TAG é '$TAGGED', esperado '$TAG'"
fi
require_registry_integrity
echo "✓ npm: $PKG_NAME@$TAG servido, e é o tarball testado"

if [[ -z "$LOCAL_TAG" ]]; then
  git tag "$GIT_TAG" "$TARGET"
fi
if [[ -z "$REMOTE_TAG" ]]; then
  echo "→ Push da tag $GIT_TAG"
  git push origin "refs/tags/$GIT_TAG"
fi

TAG_COMMIT=$(gh api "repos/{owner}/{repo}/commits/$GIT_TAG" --jq .sha)
[[ "$TAG_COMMIT" == "$TARGET" ]] || fail "a tag $GIT_TAG no GitHub aponta para $TAG_COMMIT, mas $TARGET é o que foi publicado"


NOTES="$WORK/release-notes.md"
node "$TREE/scripts/changelog.mjs" notes "$TAG" --allow-unreleased >"$NOTES"
{
  echo ""
  echo "---"
  echo ""
  echo "📦 npm: [\`$PKG_NAME@$TAG\`](https://www.npmjs.com/package/$PKG_NAME/v/$TAG) — publicado da máquina do mantenedor, sem provenance."
} >>"$NOTES"
FLAGS=(--title "$GIT_TAG" --notes-file "$NOTES")
[[ "$PRERELEASE" == "true" ]] && FLAGS+=(--prerelease)
ASSETS=("$TARBALL")

if gh release view "$GIT_TAG" >/dev/null 2>&1; then
  gh release edit "$GIT_TAG" "${FLAGS[@]}"
  gh release upload "$GIT_TAG" "$TARBALL" --clobber
else
  REGISTRY_LATEST=$(bash "$DIST_TAG_SCRIPT" current-latest "$PKG_NAME")
  if [[ "$REGISTRY_LATEST" == "$TAG" ]]; then
    LATEST_FLAG=--latest
  else
    LATEST_FLAG=--latest=false
  fi
  gh release create "$GIT_TAG" "${ASSETS[@]}" --verify-tag "$LATEST_FLAG" "${FLAGS[@]}"
fi

echo ""
echo "✓ $GIT_TAG publicado: npm ($DIST_TAG), tag no origin e GitHub Release em $TARGET"
