#!/usr/bin/env bash
# scripts/sync-github-releases.sh — reconcilia GitHub Releases com as git tags
# (e, por consequência, com as versões publicadas no npm).
#
# Cada tag `v*.*.*` que ainda não tem Release ganha um, com as notas vindas da
# seção correspondente do CHANGELOG. Tags que já têm Release são puladas — o
# script é idempotente e nunca reescreve um Release existente.
#
# Uso:
#   scripts/sync-github-releases.sh            # cria os Releases faltantes
#   DRY_RUN=1 scripts/sync-github-releases.sh  # só lista o que faria
#
# Requer `gh` autenticado com permissão de escrita no repositório.

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI não encontrado"
  exit 1
fi

PKG_NAME=$(node -p "require('./package.json').name")

mapfile -t TAGS < <(git tag -l "v*.*.*" --sort=v:refname)
if [[ ${#TAGS[@]} -eq 0 ]]; then
  echo "· nenhuma tag v*.*.* encontrada"
  exit 0
fi

created=0
skipped=0

for tag in "${TAGS[@]}"; do
  version="${tag#v}"

  if gh release view "$tag" >/dev/null 2>&1; then
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "→ criaria Release $tag"
    created=$((created + 1))
    continue
  fi

  notes_file="$(mktemp)"
  node scripts/changelog.mjs notes "$version" > "$notes_file"
  {
    echo ""
    echo "---"
    echo ""
    echo "📦 npm: [\`${PKG_NAME}@${version}\`](https://www.npmjs.com/package/${PKG_NAME}/v/${version})"
  } >> "$notes_file"

  flags=(--title "$tag" --notes-file "$notes_file" --verify-tag)
  case "$version" in
    *-*) flags+=(--prerelease) ;;
  esac

  gh release create "$tag" "${flags[@]}" >/dev/null
  rm -f "$notes_file"
  echo "✓ Release $tag criado"
  created=$((created + 1))
done

echo ""
if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN — $created Release(s) a criar, $skipped já existente(s)"
else
  echo "✓ $created Release(s) criado(s), $skipped já existente(s)"
fi
