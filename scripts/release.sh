#!/usr/bin/env bash
# scripts/release.sh — pipeline de release com release branch + tag push + PR.
#
# Uso:
#   scripts/release.sh <TAG>
#
# Variáveis de ambiente:
#   DRY_RUN=1         cria branch + commit + tag local mas pula push e PR
#   SKIP_VALIDATE=1   pula validação local (lint/typecheck/build/test)
#   BASE_BRANCH=main  branch alvo do PR (default: main)

set -euo pipefail

TAG="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_VALIDATE="${SKIP_VALIDATE:-0}"
BASE_BRANCH="${BASE_BRANCH:-main}"

usage() {
  cat <<EOF
Uso: $0 <TAG>

Variáveis:
  DRY_RUN=1         cria branch + commit + tag local mas pula push e PR
  SKIP_VALIDATE=1   pula validação local (lint/typecheck/build/test)
  BASE_BRANCH=main  branch alvo do PR (default: main)
EOF
}

if [[ -z "$TAG" ]]; then
  usage
  exit 1
fi

if ! [[ "$TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9]+)*$ ]]; then
  echo "ERROR: TAG inválido '$TAG' — esperado formato semver (ex.: 0.1.1, 1.0.0-rc1)"
  exit 1
fi

GIT_TAG="v$TAG"
REGISTRY="npm"
WORKFLOW_FILE="release-npm.yml"
DEPLOY_NOTE="- Workflow \`npm publish\` roda automaticamente assim que a tag é pusheada (sem aprovação manual)."

CHANGELOG="CHANGELOG.md"
RELEASE_BRANCH="release/$GIT_TAG"

# 1. Working tree limpa
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree sujo — comite ou stash antes de fazer release"
  git status --short
  exit 1
fi

# 2. Tag não existe (local nem remoto)
if git rev-parse "$GIT_TAG" >/dev/null 2>&1; then
  echo "ERROR: tag $GIT_TAG já existe localmente"
  exit 1
fi
if git ls-remote --tags origin "$GIT_TAG" 2>/dev/null | grep -q "refs/tags/$GIT_TAG\$"; then
  echo "ERROR: tag $GIT_TAG já existe no origin"
  exit 1
fi

# 3. Branch de release não existe
if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
  echo "ERROR: branch $RELEASE_BRANCH já existe localmente"
  exit 1
fi

# 4. CHANGELOG menciona TAG (ou ao menos [Unreleased])
if ! grep -qE "\[$TAG\]|\[Unreleased\]" "$CHANGELOG"; then
  echo "AVISO: $CHANGELOG não menciona [$TAG] nem [Unreleased] — atualize antes de continuar."
  echo "       (Ctrl+C para abortar, ENTER para seguir mesmo assim)"
  read -r _
fi

echo "→ Criando branch $RELEASE_BRANCH (a partir de $(git rev-parse --abbrev-ref HEAD))"
git checkout -b "$RELEASE_BRANCH"

echo "→ Bump de versão para $TAG"
npm version "$TAG" --no-git-tag-version --allow-same-version >/dev/null
VERSION_PATHSPEC=("package.json" "package-lock.json")

if [[ "$SKIP_VALIDATE" != "1" ]]; then
  echo "→ Validando build localmente"
  npm ci
  npm run typecheck
  npm run lint
  npm run format:check
  npm run test:run
  npm run build
  npm pack --dry-run
fi

echo "→ Stage + commit do release"
git add "${VERSION_PATHSPEC[@]}" "$CHANGELOG"
if ! git diff --cached --quiet; then
  git commit -m "chore: release $GIT_TAG"
else
  echo "  (sem mudanças nos arquivos de versão — taggeando HEAD existente)"
fi

echo "→ Tag local $GIT_TAG"
git tag "$GIT_TAG"

echo "→ Regenerando RELEASES.md"
make releases-md >/dev/null
if ! git diff --quiet -- RELEASES.md 2>/dev/null; then
  git add RELEASES.md
  git commit -m "docs: refresh RELEASES.md after $GIT_TAG"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "✓ DRY_RUN — branch '$RELEASE_BRANCH' e tag '$GIT_TAG' criados localmente"
  echo "  para finalizar manualmente:"
  echo "    git push -u origin $RELEASE_BRANCH"
  echo "    git push origin $GIT_TAG"
  echo "    gh pr create --base $BASE_BRANCH --head $RELEASE_BRANCH --title \"chore: release $GIT_TAG\""
  exit 0
fi

echo "→ Push da branch $RELEASE_BRANCH"
git push -u origin "$RELEASE_BRANCH"

echo "→ Push da tag $GIT_TAG (dispara workflow $WORKFLOW_FILE)"
git push origin "$GIT_TAG"

PR_BODY=$(mktemp)
trap "rm -f '$PR_BODY'" EXIT

cat > "$PR_BODY" <<EOF
Tem Script? | Novas Env Vars
-- | --
Não | Não

> :warning: **NOTA**
> - A tag \`$GIT_TAG\` já foi pusheada — o workflow [\`$WORKFLOW_FILE\`](.github/workflows/$WORKFLOW_FILE) está rodando no GitHub Actions, independente do merge deste PR.
> - O merge propaga para \`$BASE_BRANCH\` o bump de versão e a entrada em \`RELEASES.md\`.

## Problema

Liberar a versão $TAG do pacote \`tempest-react-sdk\` no $REGISTRY.

## Solução

- Bump de versão para $TAG em \`package.json\` e \`package-lock.json\`
- Tag \`$GIT_TAG\` criada e pushed → workflow de release disparado
- \`RELEASES.md\` regenerado a partir das git tags

## Screenshots

**Descrição do Screenshot**:
Não se aplica — release de SDK (sem mudança de UI).

## Outras mudanças

- \`RELEASES.md\` atualizado com a entrada da tag \`$GIT_TAG\`

## Notas sobre deploy

$DEPLOY_NOTE

**Validação local executada**:
- \`make validate\` (typecheck + lint + format-check + test + build + pack dry-run)

**Novas Variáveis de Ambiente**:
- Nenhuma

**Novos Scripts e/ou Tarefas de Background**:
- Nenhum

**Novas Dependências**:
- Nenhuma
EOF

echo "→ Abrindo PR via gh (base=$BASE_BRANCH ← head=$RELEASE_BRANCH)"
PR_URL=$(gh pr create \
  --base "$BASE_BRANCH" \
  --head "$RELEASE_BRANCH" \
  --title "chore: release $GIT_TAG" \
  --body-file "$PR_BODY")

echo ""
echo "✓ Release $GIT_TAG iniciada:"
echo "  - tag pushed → workflow $REGISTRY rodando em GitHub Actions"
echo "  - PR aberto: $PR_URL"
