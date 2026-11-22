#!/usr/bin/env bash
# scripts/docs-deploy.sh — builda o site MkDocs da `main` e o publica na `gh-pages`.
#
# Uso:
#   scripts/docs-deploy.sh            # build + push para a gh-pages
#   DRY_RUN=1 scripts/docs-deploy.sh  # só o build e as conferências
#
# Substitui o `docs.yml` (GitHub Actions → Pages), que saiu em 2026-11-13 com a
# regra do dono: Actions só em repositório da org `7rc`. Roda na máquina de quem
# publica, com o mesmo build que o workflow fazia:
#
#  1. busca `origin/main` e abre um `git worktree` descartável dela — o site
#     publicado é o da `main`, nunca o do checkout local, que pode estar sujo ou
#     em outra branch, e nada no checkout é tocado;
#  2. cria um venv descartável com `uv` e instala `docs/requirements.txt` com
#     `--require-hashes` (#532): toda dependência com versão e hash fixados, então
#     a instalação falha em vez de aceitar bytes que ninguém revisou;
#  3. `node scripts/gen-llms.mjs` e `mkdocs build --strict` (aviso reprova);
#  4. confere que as duas línguas saíram (`index.html` e `en/index.html`);
#  5. empurra **esse** diretório para a `gh-pages` com o `ghp-import` do mesmo
#     venv (a lib que o `mkdocs gh-deploy` usa por baixo, já no requirements com
#     hash). `mkdocs gh-deploy` buildaria de novo — o que chegaria à branch seria
#     um segundo build que ninguém conferiu;
#  6. antes do push, `scripts/pages-check.sh` confere (só lendo, com `gh api`) que
#     o Pages vai de fato publicar a `gh-pages`: fonte na branch **e** Actions
#     ligado só para as actions da GitHub. Sem o Actions o push entra e nenhum
#     build acontece — o site ficou parado de 13 a 22/11/2026 com o script
#     dizendo ✓. Configuração errada para o deploy antes do push; no `DRY_RUN` o
#     resultado só é mostrado. Corrigir a configuração é ação do dono.
#
# Variáveis de ambiente:
#   DRY_RUN=1          para depois do passo 4, sem push
#   DOCS_PYTHON=3.12   Python do venv (o que o docs.yml usava)

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
DOCS_PYTHON="${DOCS_PYTHON:-3.12}"
PAGES_BRANCH="gh-pages"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

for tool in git node uv gh; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool não encontrado no PATH"
done

echo "→ Buscando origin/main"
git fetch --quiet --no-tags origin "+refs/heads/main:refs/remotes/origin/main"
SHA=$(git rev-parse refs/remotes/origin/main)

WORK=$(mktemp -d)
TREE="$WORK/tree"
SITE="$WORK/site"
VENV="$WORK/venv"
cleanup() {
  git worktree remove --force "$TREE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "→ Worktree descartável de origin/main ($(git log -1 --format='%h %s' "$SHA"))"
git worktree add --quiet --detach "$TREE" "$SHA"

echo "→ venv descartável (Python $DOCS_PYTHON) com docs/requirements.txt por hash"
uv venv --quiet --python "$DOCS_PYTHON" "$VENV"
uv pip install --quiet --python "$VENV/bin/python" --require-hashes -r "$TREE/docs/requirements.txt"

echo "→ llms.txt + mkdocs build --strict"
(cd "$TREE" && node scripts/gen-llms.mjs && "$VENV/bin/mkdocs" build --strict --site-dir "$SITE")

for page in index.html en/index.html; do
  [[ -f "$SITE/$page" ]] || fail "o build não gerou $page: uma das línguas não saiu"
done
echo "  ✓ $(find "$SITE" -name '*.html' | wc -l) páginas HTML, PT-BR e EN-US"

echo "→ Configuração do Pages"
if [[ "$DRY_RUN" == "1" ]]; then
  "$SCRIPTS/pages-check.sh" || echo "  (DRY_RUN: o deploy real pararia aqui)"
  echo ""
  echo "✓ DRY_RUN — site de ${SHA:0:12} buildado e conferido; nada foi empurrado."
  exit 0
fi
"$SCRIPTS/pages-check.sh" || fail "o Pages não publicaria a $PAGES_BRANCH; nada foi empurrado"

echo "→ Push do site para a $PAGES_BRANCH"
(cd "$TREE" && "$VENV/bin/ghp-import" --no-jekyll --push --force --remote origin \
  --branch "$PAGES_BRANCH" --message "docs: deploy ${SHA:0:12}" "$SITE")

echo ""
echo "✓ site de ${SHA:0:12} na $PAGES_BRANCH; o Pages publica em ~1 min (gh run list --limit 1)"
