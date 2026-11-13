#!/usr/bin/env bash
# scripts/check-release-ref.sh — guard de ref do publish local (#452, #472, #527).
#
# Chamado pelo `scripts/release-tag.sh` (`make release-tag`) antes de instalar,
# buildar ou publicar qualquer coisa. Só publica a tag `vX.Y.Z` (ou
# `vX.Y.Z-pre`) que:
#
# 1. descreve o `version` do `package.json` **do commit** (lido com `git show`,
#    não do working tree, então o guard vale de qualquer checkout);
# 2. se já existe como tag local, aponta para esse mesmo commit — tag, npm e
#    GitHub Release ficam num SHA só;
# 3. aponta para um commit que já está na `main` (#472) — ancestral de
#    `origin/main`, ou seja, revisado e mergeado. A tag nasce depois do merge,
#    nunca na branch de release.
#
# A única exceção ao item 3 é o backport: um commit fora da `main` passa só se é
# ancestral de `origin/release-<maj>.<min>` (a branch de manutenção da linha da
# própria versão), **se** o dist-tag escolhido é esse mesmo `release-<maj>.<min>`
# **e se** a linha está em BACKPORT_LINES (#527). BACKPORT_LINES é passada por
# quem publica, na linha de comando (`make release-tag ... BACKPORT_LINES=release-0.75`,
# separada por espaço ou vírgula): criar a branch `release-0.79` não abre a linha
# 0.79 sozinho. Vazia ou ausente, nenhum backport passa. Uma branch de manutenção
# nunca publica em `latest` nem em `next`: esses dois saem só da `main`.
#
# O `release-tag.sh` roda a cópia deste script (e do `release-dist-tag.sh`) que
# está em `origin/main`, não a do commit taggeado (#527): um commit que reescreve o
# guard não aprova a si mesmo. Isso barra engano. Quem decide quem publica, desde
# que o publish saiu do GitHub Actions (2026-11-13), é a credencial npm de quem
# roda o `make release-tag` — veja `docs/release.md`.
#
# Sem `origin/main` no repositório o guard falha fechado, em vez de pular a
# conferência.
#
# Lê RELEASE_TAG, RELEASE_SHA, CURRENT_LATEST e BACKPORT_LINES. Escreve
# `tag=`, `version=`, `prerelease=` e `dist_tag=` na stdout, uma por linha; as
# mensagens vão para a stderr.
#
# O dist-tag é monotônico (#472) e a regra mora em `scripts/release-dist-tag.sh`
# (`pick`), a mesma que o `release-tag.sh` reaplica logo antes do `npm publish`.
# CURRENT_LATEST é o `latest` do registry, lido com
# `release-dist-tag.sh current-latest`; vazio é pacote que ainda não existe.
# Precisa estar definida, mesmo vazia: ausente, o guard falha em vez de assumir
# pacote novo e mandar qualquer versão para `latest`.

set -euo pipefail

DIST_TAG_SCRIPT="$(dirname "$0")/release-dist-tag.sh"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

TAG="${RELEASE_TAG:-}"
SHA="${RELEASE_SHA:-}"

if [ -z "$TAG" ] || [ -z "$SHA" ]; then
    fail "RELEASE_TAG and RELEASE_SHA are required: the guard checks one tag against one commit"
fi

if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    fail "tag '${TAG}' is not vX.Y.Z (or vX.Y.Z-prerelease)"
fi

COMMIT=$(git rev-parse --verify --quiet "${SHA}^{commit}" || true)
if [ -z "$COMMIT" ]; then
    fail "'${SHA}' is not a commit"
fi

PKG_VERSION=$(git show "${COMMIT}:package.json" | node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>process.stdout.write(String(JSON.parse(s).version)))')

if [ "${TAG#v}" != "$PKG_VERSION" ]; then
    fail "tag ${TAG} does not match package.json version ${PKG_VERSION}"
fi

TAG_COMMIT=$(git rev-parse --verify --quiet "refs/tags/${TAG}^{commit}" || true)
if [ -n "$TAG_COMMIT" ] && [ "$TAG_COMMIT" != "$COMMIT" ]; then
    fail "tag ${TAG} points at '${TAG_COMMIT}', but the release is ${COMMIT}"
fi

if [ -z "${CURRENT_LATEST+set}" ]; then
    fail "CURRENT_LATEST is not set. Pass the registry's latest dist-tag (empty when the package has none) so a backport cannot move latest backwards."
fi
case "$PKG_VERSION" in
    *-*) PRERELEASE=true ;;
    *) PRERELEASE=false ;;
esac
DIST_TAG=$(bash "$DIST_TAG_SCRIPT" pick "$PKG_VERSION" "$CURRENT_LATEST")

if ! git rev-parse --verify --quiet "refs/remotes/origin/main^{commit}" >/dev/null; then
    fail "origin/main is not in this repository, so ${TAG} cannot be checked against it. Run: git fetch origin main"
fi
if git merge-base --is-ancestor "$COMMIT" refs/remotes/origin/main; then
    REACHED_FROM=main
else
    MAINTENANCE="release-$(echo "$PKG_VERSION" | cut -d. -f1,2)"
    OPENED=false
    OPENED_LINES="${BACKPORT_LINES:-}"
    for LINE in ${OPENED_LINES//,/ }; do
        if [ "$LINE" = "$MAINTENANCE" ]; then
            OPENED=true
        fi
    done
    if [ "$DIST_TAG" = "$MAINTENANCE" ] && [ "$OPENED" = false ]; then
        fail "${TAG} points at ${COMMIT}, which is not on main, and ${MAINTENANCE} is not an opened backport line. Open it for this run with BACKPORT_LINES=${MAINTENANCE} (currently '${BACKPORT_LINES:-}')."
    fi
    if [ "$DIST_TAG" = "$MAINTENANCE" ] &&
        git rev-parse --verify --quiet "refs/remotes/origin/${MAINTENANCE}^{commit}" >/dev/null &&
        git merge-base --is-ancestor "$COMMIT" "refs/remotes/origin/${MAINTENANCE}"; then
        REACHED_FROM="$MAINTENANCE"
    else
        fail "${TAG} points at ${COMMIT}, which is not on main. Tag the merge commit after the release PR is merged: make release-tag TAG=${PKG_VERSION}. A backport below the registry's latest may instead come from origin/${MAINTENANCE}."
    fi
fi

echo "tag=${TAG}"
echo "version=${PKG_VERSION}"
echo "prerelease=${PRERELEASE}"
echo "dist_tag=${DIST_TAG}"
echo "✓ ${TAG} == package.json ${PKG_VERSION} @ ${COMMIT} (on origin/${REACHED_FROM}) → dist-tag ${DIST_TAG} (registry latest: '${CURRENT_LATEST}')" >&2
