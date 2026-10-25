#!/usr/bin/env bash
# scripts/release-tag.sh — taggeia a release DEPOIS do merge do PR (#472).
#
# Uso:
#   scripts/release-tag.sh <TAG>
#
# Variáveis de ambiente:
#   DRY_RUN=1         mostra o commit que seria taggeado e para, sem criar tag
#   BASE_BRANCH=main  branch onde o PR de release foi mergeado (default: main)
#   REF=<sha>         taggeia este commit em vez de procurar o do merge; ele
#                     precisa estar na BASE_BRANCH e ter a versão TAG
#
# O push da tag `vX.Y.Z` é o que dispara o `release-npm.yml`, e o guard
# `scripts/check-release-ref.sh` só aceita tag em commit que está na `main`.
# Este script é o par do `scripts/release.sh`: aquele abre o PR, este roda
# depois do merge e taggeia o commit que entrou na `main`.
#
# O commit taggeado é o **primeiro** da história first-parent de
# `origin/<BASE_BRANCH>` cujo `package.json` tem a versão TAG — o merge (ou o
# squash) do PR de release. PRs mergeados depois dele, ainda na mesma versão,
# ficam de fora: estão no `[Unreleased]` do CHANGELOG e não podem ir para o npm
# sob a versão que não os documenta. Se a ponta da branch já está em outra
# versão, o script falha e pede `REF=`.
#
# Antes de taggear confere três coisas no commit escolhido: a versão do
# `package.json`, a linha `| vTAG |` no `RELEASES.md` (sem ela o
# `test/docs-counts.test.ts` reprova a CI do release) e que a tag não existe,
# local nem no origin.

set -euo pipefail

TAG="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
BASE_BRANCH="${BASE_BRANCH:-main}"
REF="${REF:-}"

if [[ -z "$TAG" ]]; then
  echo "Uso: $0 <TAG>   (DRY_RUN=1, BASE_BRANCH=main, REF=<sha>)"
  exit 1
fi

if ! [[ "$TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9]+)*$ ]]; then
  echo "ERROR: TAG inválido '$TAG' — esperado formato semver (ex.: 0.1.1, 1.0.0-rc1)"
  exit 1
fi

GIT_TAG="v$TAG"
BASE_REF="refs/remotes/origin/$BASE_BRANCH"

version_at() {
  git show "$1:package.json" | node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>process.stdout.write(String(JSON.parse(s).version)))'
}

echo "→ Buscando origin/$BASE_BRANCH"
git fetch --quiet --no-tags origin "+refs/heads/$BASE_BRANCH:$BASE_REF"

if git rev-parse --verify --quiet "refs/tags/$GIT_TAG" >/dev/null; then
  echo "ERROR: tag $GIT_TAG já existe localmente"
  exit 1
fi
if git ls-remote --tags origin "$GIT_TAG" | grep -q "refs/tags/$GIT_TAG\$"; then
  echo "ERROR: tag $GIT_TAG já existe no origin"
  exit 1
fi

if [[ -n "$REF" ]]; then
  TARGET=$(git rev-parse --verify --quiet "$REF^{commit}" || true)
  if [[ -z "$TARGET" ]]; then
    echo "ERROR: REF '$REF' não é um commit"
    exit 1
  fi
  if ! git merge-base --is-ancestor "$TARGET" "$BASE_REF"; then
    echo "ERROR: $TARGET não está em origin/$BASE_BRANCH — mergeie o PR de release antes de taggear"
    exit 1
  fi
  if [[ "$(version_at "$TARGET")" != "$TAG" ]]; then
    echo "ERROR: package.json em $TARGET está em $(version_at "$TARGET"), não em $TAG"
    exit 1
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
    echo "ERROR: origin/$BASE_BRANCH está em $(version_at "$BASE_REF"), não em $TAG."
    echo "       O PR de release (release/$GIT_TAG) já foi mergeado? Se a $BASE_BRANCH já"
    echo "       andou para outra versão, aponte o commit do merge com REF=<sha>."
    exit 1
  fi
fi

if ! git show "$TARGET:RELEASES.md" 2>/dev/null | grep -qE "^\| ${GIT_TAG//./\\.} +\|"; then
  echo "ERROR: RELEASES.md em $TARGET não tem a linha de $GIT_TAG — o commit não veio do scripts/release.sh"
  exit 1
fi

echo "→ $GIT_TAG → $(git log -1 --format='%h %s' "$TARGET")"

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "✓ DRY_RUN — nada foi criado. Para taggear de verdade:"
  echo "    make release-tag TAG=$TAG"
  exit 0
fi

git tag "$GIT_TAG" "$TARGET"
echo "→ Push da tag $GIT_TAG (dispara o workflow release-npm.yml)"
git push origin "refs/tags/$GIT_TAG"

echo ""
echo "✓ $GIT_TAG pusheada em $TARGET — acompanhe com: gh run list --workflow release-npm.yml"
