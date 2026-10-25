#!/usr/bin/env bash
# scripts/check-release-ref.sh — guard de ref do release-npm.yml (#452).
#
# O workflow só publica a partir de uma tag `vX.Y.Z` (ou `vX.Y.Z-pre`) que:
#
# 1. é o ref da run — em `workflow_dispatch` também, então o disparo manual é
#    `gh workflow run release-npm.yml --ref vX.Y.Z`, nunca `--ref main`;
# 2. descreve o `version` do `package.json` do commit em checkout;
# 3. aponta para o commit da run (`GITHUB_SHA`), que é o que vai para o npm;
# 4. aponta para um commit que já está na `main` (#472) — ancestral de
#    `origin/main`, ou seja, revisado e mergeado. A tag nasce depois do merge
#    (`make release-tag`), nunca na branch de release.
#
# A única exceção ao item 4 é o backport: um commit fora da `main` passa só se é
# ancestral de `origin/release-<maj>.<min>` (a branch de manutenção da linha da
# própria versão) **e** o dist-tag escolhido é esse mesmo `release-<maj>.<min>`.
# Assim uma branch de manutenção nunca publica em `latest` nem em `next`: esses
# dois saem só da `main`. Proteger `release-*` (PR obrigatório) é configuração do
# repositório, como proteger a `main`.
#
# O item 4 precisa do histórico das branches: o checkout do job `build` usa
# `fetch-depth: 0`, que traz `refs/remotes/origin/*`. Sem `origin/main` no
# checkout o guard falha fechado, em vez de pular a conferência.
#
# Antes, um dispatch de branch derivava a tag do `package.json` sem conferir nada,
# publicava aquela árvore e o `gh release create` criava a tag na HEAD da branch
# padrão — outro commit. Com o guard, tag, npm e Release apontam para o mesmo SHA.
#
# Lê GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_SHA e CURRENT_LATEST; escreve tag,
# version, prerelease e dist_tag em GITHUB_OUTPUT. Roda na raiz do checkout, com
# as tags buscadas.
#
# O dist-tag é monotônico (#472) e a regra mora em `scripts/release-dist-tag.sh`
# (`pick`), a mesma que o job publish reaplica logo antes do `npm publish`.
# CURRENT_LATEST é o `latest` do registry, lido pelo workflow com
# `release-dist-tag.sh current-latest`; vazio é pacote que ainda não existe.
# Precisa estar definida, mesmo vazia: ausente, o guard falha em vez de assumir
# pacote novo e mandar qualquer versão para `latest`.

set -euo pipefail

DIST_TAG_SCRIPT="$(dirname "$0")/release-dist-tag.sh"

PKG_VERSION=$(node -p "require('./package.json').version")

if [ "${GITHUB_REF_TYPE:-}" != "tag" ]; then
    echo "::error::release-npm.yml publishes from a tag only, and this run is on the ${GITHUB_REF_TYPE:-unknown} '${GITHUB_REF_NAME:-}'. Dispatch it with: gh workflow run release-npm.yml --ref v${PKG_VERSION}"
    exit 1
fi

TAG="${GITHUB_REF_NAME}"
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "::error::tag '${TAG}' is not vX.Y.Z (or vX.Y.Z-prerelease)"
    exit 1
fi

if [ "${TAG#v}" != "$PKG_VERSION" ]; then
    echo "::error::tag ${TAG} does not match package.json version ${PKG_VERSION}"
    exit 1
fi

TAG_COMMIT=$(git rev-parse --verify --quiet "refs/tags/${TAG}^{commit}" || true)
if [ "$TAG_COMMIT" != "${GITHUB_SHA:-}" ]; then
    echo "::error::tag ${TAG} points at '${TAG_COMMIT}', but this run checked out '${GITHUB_SHA:-}'"
    exit 1
fi

if [ -z "${CURRENT_LATEST+set}" ]; then
    echo "::error::CURRENT_LATEST is not set. Pass the registry's dist-tags.latest (empty when the package has none) so a backport cannot move latest backwards."
    exit 1
fi
case "$PKG_VERSION" in
    *-*) PRERELEASE=true ;;
    *) PRERELEASE=false ;;
esac
PICK_ERR=$(mktemp)
DIST_TAG=$(bash "$DIST_TAG_SCRIPT" pick "$PKG_VERSION" "$CURRENT_LATEST" 2> "$PICK_ERR") || {
    cat "$PICK_ERR"
    rm -f "$PICK_ERR"
    exit 1
}
rm -f "$PICK_ERR"

if ! git rev-parse --verify --quiet "refs/remotes/origin/main^{commit}" >/dev/null; then
    echo "::error::origin/main is not in this checkout, so ${TAG} cannot be checked against it. The build job's checkout needs fetch-depth: 0."
    exit 1
fi
if git merge-base --is-ancestor "${GITHUB_SHA}" refs/remotes/origin/main; then
    REACHED_FROM=main
else
    MAINTENANCE="release-$(echo "$PKG_VERSION" | cut -d. -f1,2)"
    if [ "$DIST_TAG" = "$MAINTENANCE" ] &&
        git rev-parse --verify --quiet "refs/remotes/origin/${MAINTENANCE}^{commit}" >/dev/null &&
        git merge-base --is-ancestor "${GITHUB_SHA}" "refs/remotes/origin/${MAINTENANCE}"; then
        REACHED_FROM="$MAINTENANCE"
    else
        echo "::error::${TAG} points at ${GITHUB_SHA}, which is not on main. Tag the merge commit after the release PR is merged: make release-tag TAG=${PKG_VERSION}. A backport below the registry's latest may instead come from origin/${MAINTENANCE}."
        exit 1
    fi
fi

{
    echo "tag=${TAG}"
    echo "version=${PKG_VERSION}"
    echo "prerelease=${PRERELEASE}"
    echo "dist_tag=${DIST_TAG}"
} >> "$GITHUB_OUTPUT"
echo "✓ ${TAG} == package.json ${PKG_VERSION} @ ${GITHUB_SHA} (on origin/${REACHED_FROM}) → dist-tag ${DIST_TAG} (registry latest: '${CURRENT_LATEST}')"
