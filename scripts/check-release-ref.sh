#!/usr/bin/env bash
# scripts/check-release-ref.sh — guard de ref do release-npm.yml (#452).
#
# O workflow só publica a partir de uma tag `vX.Y.Z` (ou `vX.Y.Z-pre`) que:
#
# 1. é o ref da run — em `workflow_dispatch` também, então o disparo manual é
#    `gh workflow run release-npm.yml --ref vX.Y.Z`, nunca `--ref main`;
# 2. descreve o `version` do `package.json` do commit em checkout;
# 3. aponta para o commit da run (`GITHUB_SHA`), que é o que vai para o npm.
#
# Antes, um dispatch de branch derivava a tag do `package.json` sem conferir nada,
# publicava aquela árvore e o `gh release create` criava a tag na HEAD da branch
# padrão — outro commit. Com o guard, tag, npm e Release apontam para o mesmo SHA.
#
# Lê GITHUB_REF_TYPE, GITHUB_REF_NAME e GITHUB_SHA; escreve tag, version,
# prerelease e dist_tag em GITHUB_OUTPUT. Prerelease vai para o dist-tag `next`:
# publicada em `latest`, uma `-rc.1` viraria o default de todo `npm install`. Roda na raiz do checkout, com as tags buscadas.

set -euo pipefail

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

{
    echo "tag=${TAG}"
    echo "version=${PKG_VERSION}"
    case "$PKG_VERSION" in
        *-*) printf "prerelease=true\ndist_tag=next\n" ;;
        *) printf "prerelease=false\ndist_tag=latest\n" ;;
    esac
} >> "$GITHUB_OUTPUT"
echo "✓ ${TAG} == package.json ${PKG_VERSION} @ ${GITHUB_SHA}"
