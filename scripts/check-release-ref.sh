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
# Lê GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_SHA e CURRENT_LATEST; escreve tag,
# version, prerelease e dist_tag em GITHUB_OUTPUT. Roda na raiz do checkout, com
# as tags buscadas.
#
# O dist-tag é monotônico (#472): `latest` só anda para a frente.
#
# - Prerelease vai para `next`: publicada em `latest`, uma `-rc.1` viraria o
#   default de todo `npm install`.
# - Versão estável maior que CURRENT_LATEST (o `dist-tags.latest` do registry,
#   lido pelo workflow) vai para `latest`. CURRENT_LATEST vazio é pacote sem
#   `latest` ainda, e também vai para `latest`.
# - Versão estável menor ou igual vai para `release-<major>.<minor>`: um backport
#   `v0.75.1` publicado depois da 0.77.0 não leva o `latest` para trás. O nome não
#   é `v0.75` porque o npm recusa dist-tag que seja range semver válido
#   (`npm publish --tag v0.75` sai com "Tag name must not be a valid SemVer
#   range", medido no npm 12.2.0).
#
# CURRENT_LATEST precisa estar definida, mesmo vazia: ausente, o guard falha em
# vez de assumir pacote novo e mandar qualquer versão para `latest`.

set -euo pipefail

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'

# Compara dois inteiros decimais sem limite de tamanho; imprime -1, 0 ou 1.
compare_numbers() {
    local a="$1" b="$2"
    if [ "${#a}" -ne "${#b}" ]; then
        if [ "${#a}" -gt "${#b}" ]; then echo 1; else echo -1; fi
    elif [[ "$a" > "$b" ]]; then
        echo 1
    elif [[ "$a" < "$b" ]]; then
        echo -1
    else
        echo 0
    fi
}

# Sucesso quando a versão estável $1 é maior que a versão semver $2.
is_newer_than() {
    local candidate="$1" current="$2" i order
    local -a mine theirs
    IFS=. read -r -a mine <<< "${candidate%%-*}"
    IFS=. read -r -a theirs <<< "${current%%-*}"
    for i in 0 1 2; do
        order=$(compare_numbers "${mine[$i]}" "${theirs[$i]}")
        [ "$order" = 1 ] && return 0
        [ "$order" = -1 ] && return 1
    done
    [ "$current" != "${current%%-*}" ]
}

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
if [ -n "$CURRENT_LATEST" ] && ! [[ "$CURRENT_LATEST" =~ $SEMVER_RE ]]; then
    echo "::error::CURRENT_LATEST '${CURRENT_LATEST}' is not a semver version"
    exit 1
fi

case "$PKG_VERSION" in
    *-*)
        PRERELEASE=true
        DIST_TAG=next
        ;;
    *)
        PRERELEASE=false
        if [ -z "$CURRENT_LATEST" ] || is_newer_than "$PKG_VERSION" "$CURRENT_LATEST"; then
            DIST_TAG=latest
        else
            IFS=. read -r MAJOR MINOR _ <<< "$PKG_VERSION"
            DIST_TAG="release-${MAJOR}.${MINOR}"
        fi
        ;;
esac

{
    echo "tag=${TAG}"
    echo "version=${PKG_VERSION}"
    echo "prerelease=${PRERELEASE}"
    echo "dist_tag=${DIST_TAG}"
} >> "$GITHUB_OUTPUT"
echo "✓ ${TAG} == package.json ${PKG_VERSION} @ ${GITHUB_SHA} → dist-tag ${DIST_TAG} (registry latest: '${CURRENT_LATEST}')"
