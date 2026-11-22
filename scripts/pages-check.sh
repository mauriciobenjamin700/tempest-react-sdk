#!/usr/bin/env bash
# scripts/pages-check.sh — confere que o GitHub Pages vai publicar a `gh-pages`.
#
# Uso:
#   scripts/pages-check.sh   # sai 0 quando o Pages publica a gh-pages; 1 com a lista do que falta
#
# Empurrar a `gh-pages` não basta. O Pages em modo "Deploy from a branch" publica
# rodando o workflow embutido `pages-build-deployment`, que é do GitHub mas roda no
# Actions: com o Actions desligado o push entra, nenhum build acontece e o site
# fica no conteúdo antigo, sem erro em lugar nenhum. Foi o que aconteceu entre
# 13/11/2026 (Actions desligado com a saída do `docs.yml`) e 22/11/2026: todo
# `make docs-deploy` terminou com `✓ site na gh-pages` e o site seguiu no último
# deploy feito pelo `docs.yml`, de 02/11/2026.
#
# A regra global do dono abre uma única exceção à proibição do Actions: repo
# público de pacote ou ferramenta open source pode ligá-lo só para o Pages, com
# `.github/workflows/` vazio e as actions restritas às da GitHub. Este script
# confere as quatro coisas, só lendo (`gh api` sem escrita):
#
#  1. o repositório é público (repo privado não entra na exceção);
#  2. o Pages é `legacy` com fonte na `gh-pages`;
#  3. o Actions está ligado, com `allowed_actions=selected`;
#  4. as actions selecionadas são só as da GitHub (sem verificadas, sem padrões).
#
# Cada problema sai com o comando que o corrige. O script não corrige nada: mudar
# configuração do repositório é ação do dono.

set -euo pipefail

PAGES_BRANCH="gh-pages"

command -v gh >/dev/null 2>&1 || { echo "ERROR: gh não encontrado no PATH" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: node não encontrado no PATH" >&2; exit 1; }

read_api() {
  gh api "repos/{owner}/{repo}$1" 2>/dev/null || echo "null"
}

REPO_JSON=$(read_api "")
PAGES_JSON=$(read_api "/pages")
ACTIONS_JSON=$(read_api "/actions/permissions")
SELECTED_JSON=$(read_api "/actions/permissions/selected-actions")

node - "$PAGES_BRANCH" "$REPO_JSON" "$PAGES_JSON" "$ACTIONS_JSON" "$SELECTED_JSON" <<'NODE'
const [branch, repoText, pagesText, actionsText, selectedText] = process.argv.slice(2);
const parse = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};
const repo = parse(repoText);
const pages = parse(pagesText);
const actions = parse(actionsText);
const selected = parse(selectedText);
const problems = [];

if (!repo) problems.push(["não deu para ler o repositório (gh auth status?)", null]);
else if (repo.private) {
    problems.push([
        "o repositório é privado: a exceção do Actions para o Pages vale só para repo público",
        null,
    ]);
}

if (!pages) {
    problems.push([
        "o Pages não está configurado",
        `gh api -X POST repos/{owner}/{repo}/pages -f build_type=legacy -f 'source[branch]=${branch}' -f 'source[path]=/'`,
    ]);
} else if (pages.build_type !== "legacy" || pages.source?.branch !== branch) {
    problems.push([
        `o Pages está em '${pages.build_type} ${pages.source?.branch ?? ""}', não serve a ${branch}`,
        `gh api -X PUT repos/{owner}/{repo}/pages -f build_type=legacy -f 'source[branch]=${branch}' -f 'source[path]=/'`,
    ]);
}

if (!actions || actions.enabled !== true) {
    problems.push([
        "o Actions está desligado: o Pages publica pelo pages-build-deployment, que roda no Actions",
        "gh api -X PUT repos/{owner}/{repo}/actions/permissions -F enabled=true -f allowed_actions=selected",
    ]);
} else if (actions.allowed_actions !== "selected") {
    problems.push([
        `o Actions permite '${actions.allowed_actions}': a exceção é só para as actions da GitHub`,
        "gh api -X PUT repos/{owner}/{repo}/actions/permissions -F enabled=true -f allowed_actions=selected",
    ]);
}

if (actions?.enabled === true && actions.allowed_actions === "selected") {
    const onlyGithub =
        selected?.github_owned_allowed === true &&
        selected?.verified_allowed === false &&
        (selected?.patterns_allowed ?? []).length === 0;
    if (!onlyGithub) {
        problems.push([
            "as actions selecionadas não são só as da GitHub",
            "gh api -X PUT repos/{owner}/{repo}/actions/permissions/selected-actions -F github_owned_allowed=true -F verified_allowed=false",
        ]);
    }
}

if (problems.length === 0) {
    console.log(`✓ Pages publica a ${branch} (repo público, Actions só com as actions da GitHub)`);
    process.exit(0);
}

console.error(`ERROR: o Pages não vai publicar a ${branch}. Ação do dono:`);
for (const [problem, fix] of problems) {
    console.error(`  - ${problem}`);
    if (fix) console.error(`      ${fix}`);
}
process.exit(1);
NODE
