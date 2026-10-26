#!/usr/bin/env bash
# scripts/release.sh — abre o PR de release: branch + bump + CHANGELOG + PR.
#
# Uso:
#   scripts/release.sh <TAG>
#
# Este script NÃO taggeia (#472). A tag `vX.Y.Z` é o que publica no npm, e o
# guard do `release-npm.yml` só aceita tag em commit que já está na `main`.
# Depois do merge do PR, o passo seguinte é `make release-tag TAG=<TAG>`
# (`scripts/release-tag.sh`), que taggeia o commit do merge e faz o push.
#
# Variáveis de ambiente:
#   DRY_RUN=1         cria branch + commits locais mas pula push e PR
#   SKIP_VALIDATE=1   pula o make check local (o único gate: a CI não testa)
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
  DRY_RUN=1         cria branch + commits locais mas pula push e PR
  SKIP_VALIDATE=1   pula o make check local (o único gate: a CI não testa)
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

# Fecha o [Unreleased] numa seção datada da versão. O workflow de release usa
# exatamente essa seção como corpo do GitHub Release, então sem isso o Release
# sai com as notas do ciclo seguinte.
echo "→ Fechando o CHANGELOG em [$TAG]"
node scripts/changelog.mjs close "$TAG"

echo "→ Stage + commit do release"
git add "${VERSION_PATHSPEC[@]}" "$CHANGELOG"
if ! git diff --cached --quiet; then
  git commit -m "chore: release $GIT_TAG"
else
  echo "  (sem mudanças nos arquivos de versão)"
fi

# `make releases-md` lê as git tags, então a linha da versão sendo lançada só é
# gerada com uma tag local provisória. Ela existe só durante o comando e é
# apagada logo depois: a tag de verdade nasce no commit do merge, na `main`,
# pelo `make release-tag` (#472). A coluna Commit da linha nova aponta para o
# `chore: release` desta branch — que o merge commit leva para a `main` — e o
# próximo `make releases-md` a reescreve com o commit da tag.
#
# O RELEASES.md com a linha nova tem de estar no commit que vai ser taggeado:
# `test/docs-counts.test.ts` exige que toda versão com seção no CHANGELOG
# apareça nele, e é essa árvore, e só ela, que o `release-npm.yml` vê.
echo "→ Regenerando RELEASES.md (com tag local provisória $GIT_TAG)"
git tag "$GIT_TAG"
if ! make releases-md >/dev/null; then
  git tag -d "$GIT_TAG" >/dev/null
  echo "ERROR: make releases-md falhou"
  exit 1
fi
git tag -d "$GIT_TAG" >/dev/null

# Formatado aqui, não pelo hook: num worktree recém-criado o `npm ci` ainda não
# rodou, os hooks do husky não existem e o lint-staged não formata nada — a
# tabela sai crua e o `format:check` do `make check` reprova o release (foi o que
# parou a v0.80.0). Pelo mesmo motivo a contagem de tags do snapshot do
# CLAUDE.md, que `test/docs-counts.test.ts` confere contra o RELEASES.md, é
# atualizada no mesmo commit.
npm ci --no-audit --no-fund >/dev/null
npx --no-install prettier --write RELEASES.md >/dev/null
TAG_ROWS=$(grep -cE '^\| v[0-9]' RELEASES.md)
sed -i -E "s/— [0-9]+ tags publicadas/— $TAG_ROWS tags publicadas/; s/\(0\.1\.0 → [0-9.]+\)/(0.1.0 → $TAG)/" CLAUDE.md
if ! git diff --quiet -- RELEASES.md CLAUDE.md 2>/dev/null; then
  git add RELEASES.md CLAUDE.md
  git commit -m "docs: refresh RELEASES.md for $GIT_TAG"
fi

# A validação roda DEPOIS do RELEASES.md, e antes de qualquer push.
#
# Ordem invertida antes da 0.65.0, e ela não sobrevive ao guard que o `e4b6791`
# adicionou: `test/docs-counts.test.ts` exige que toda versão com seção no
# CHANGELOG apareça em `RELEASES.md`. Fechando o `[Unreleased]` em `[X.Y.Z]`
# sem a linha nova no RELEASES.md, a versão sendo lançada é sempre "documentada e
# não publicada", então o release de QUALQUER versão nova reprovava — ovo e
# galinha, não defeito do guard.
#
# Validar aqui também é mais correto: a árvore aferida é exatamente a que vai
# para o PR e, depois do merge, para a tag. Desde 2026-10-26 é o `make check`
# inteiro (scripts/check.sh): a CI não roda mais suíte em PR, então este é o
# último gate antes da tag.
#
# Os passos vão encadeados com `&&`, não com `set -e` no subshell: dentro de
# `if ! ( ... )` o bash ignora o `set -e`, e só o exit do último comando contava.
# Até a 0.69.0 um teste, lint ou build quebrado passava como validado.
if [[ "$SKIP_VALIDATE" != "1" ]]; then
  echo "→ make check (RELEASES.md já no lugar)"
  if ! { ./scripts/check.sh && npm pack --dry-run; }; then
    echo ""
    echo "ERROR: validação falhou"
    echo "       nada foi empurrado; a branch $RELEASE_BRANCH continua aqui para inspeção"
    exit 1
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "✓ DRY_RUN — branch '$RELEASE_BRANCH' criada localmente (sem tag)"
  echo "  para finalizar manualmente:"
  echo "    git push -u origin $RELEASE_BRANCH"
  echo "    gh pr create --base $BASE_BRANCH --head $RELEASE_BRANCH --title \"chore: release $GIT_TAG\""
  echo "  e, depois do merge do PR:"
  echo "    make release-tag TAG=$TAG"
  exit 0
fi

echo "→ Push da branch $RELEASE_BRANCH"
git push -u origin "$RELEASE_BRANCH"

PR_BODY=$(mktemp)
trap "rm -f '$PR_BODY'" EXIT

cat > "$PR_BODY" <<EOF
Tem Script? | Novas Env Vars
-- | --
Não | Não

> :warning: **NOTA**
> - **Nada foi publicado ainda.** A tag \`$GIT_TAG\` nasce depois do merge, no commit que entrar na \`$BASE_BRANCH\`: \`make release-tag TAG=$TAG\`. O push dela dispara o [\`$WORKFLOW_FILE\`](.github/workflows/$WORKFLOW_FILE).
> - O guard do workflow reprova tag em commit que não está na \`$BASE_BRANCH\` (#472).

## Problema

Liberar a versão $TAG do pacote \`tempest-react-sdk\` no $REGISTRY.

## Solução

- Bump de versão para $TAG em \`package.json\` e \`package-lock.json\`
- \`CHANGELOG.md\`: \`[Unreleased]\` fechado em \`[$TAG]\`
- \`RELEASES.md\` regenerado com a linha de \`$GIT_TAG\`

## Screenshots

**Descrição do Screenshot**:
Não se aplica — release de SDK (sem mudança de UI).

## Outras mudanças

- \`RELEASES.md\` atualizado com a entrada da tag \`$GIT_TAG\`

## Notas sobre deploy

1. Merge deste PR.
2. \`make release-tag TAG=$TAG\` — taggeia o commit do merge na \`$BASE_BRANCH\` e faz o push da tag, que dispara o \`$WORKFLOW_FILE\`.

**Validação local executada**:
- \`make check\` (ícones + format + lint + typecheck + cobertura + build + size-limit + gallery + smokes do tarball + e2e) + pack dry-run

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
echo "✓ PR de release $GIT_TAG aberto: $PR_URL"
echo "  nada foi publicado. Depois do merge:"
echo "    make release-tag TAG=$TAG"
