#!/usr/bin/env bash
# scripts/release-dist-tag.sh — dist-tag do release-npm.yml (#472).
#
# Uma fonte só para a regra do dist-tag, chamada pelo guard
# (check-release-ref.sh, no job build), pelo job publish logo antes do
# `npm publish` e pelo job release. Subcomandos:
#
#   pick <versão> <latest-atual>   imprime o dist-tag da versão
#   current-latest <pacote>        imprime o `latest` do registry, com retry
#   get <pacote> <dist-tag>        imprime a versão sob o dist-tag, ou nada
#
# A regra do `pick` mantém o `latest` monotônico:
#
# - prerelease vai para `next`;
# - estável maior que o `latest` atual, ou sem `latest`, vai para `latest`;
# - estável igual ao `latest` atual também fica em `latest`: só acontece no
#   re-run de uma versão já publicada, e o npm não aceita publicar de novo;
# - estável menor vai para `release-<major>.<minor>`. Não `v0.75`, porque o npm
#   recusa dist-tag que seja range semver (`npm publish --tag v0.75` sai com
#   "Tag name must not be a valid SemVer range", medido no npm 12.2.0).
#
# Os dist-tags são lidos de `npm view <pacote> dist-tags --json`, nunca de
# `npm view <pacote> dist-tags.<nome>`: o npm trata o ponto como caminho, então
# `dist-tags.release-0.75` sempre volta vazio.
#
# `current-latest` só aceita `E404` explícito como pacote novo (sem `latest`).
# Resposta vazia com código 0, ou pacote sem `latest`, falha: tratar como pacote
# novo mandaria um backport para `latest`. Outra falha do `npm view` é retentada
# RELEASE_RETRY_ATTEMPTS vezes (10), com RELEASE_RETRY_SECONDS (15) entre elas.
# Mensagens vão para stderr; stdout leva só o valor.

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

# Extrai a chave $1 do JSON de dist-tags na stdin; imprime nada sem ela.
extract_tag() {
    node -e '
        let tags;
        try {
            tags = JSON.parse(require("fs").readFileSync(0, "utf8"));
        } catch {
            process.exit(0);
        }
        const value = tags && typeof tags === "object" ? tags[process.argv[1]] : undefined;
        if (typeof value === "string") process.stdout.write(value);
    ' "$1"
}

cmd_pick() {
    local version="$1" current="$2" major minor
    if ! [[ "$version" =~ $SEMVER_RE ]]; then
        echo "::error::version '${version}' is not a semver version" >&2
        return 1
    fi
    if [ -n "$current" ] && ! [[ "$current" =~ $SEMVER_RE ]]; then
        echo "::error::the registry's latest '${current}' is not a semver version" >&2
        return 1
    fi
    if [ "$version" != "${version%%-*}" ]; then
        echo next
    elif [ -z "$current" ] || [ "$version" = "$current" ] || is_newer_than "$version" "$current"; then
        echo latest
    else
        IFS=. read -r major minor _ <<< "$version"
        echo "release-${major}.${minor}"
    fi
}

cmd_current_latest() {
    local pkg="$1" attempts="${RELEASE_RETRY_ATTEMPTS:-10}" pause="${RELEASE_RETRY_SECONDS:-15}"
    local attempt out err latest
    err=$(mktemp)
    for attempt in $(seq 1 "$attempts"); do
        if out=$(npm view --prefer-online "$pkg" dist-tags --json 2> "$err"); then
            rm -f "$err"
            if [ -z "$out" ]; then
                echo "::error::npm view ${pkg} dist-tags answered nothing with exit 0; refusing to read that as a new package" >&2
                return 1
            fi
            latest=$(printf "%s" "$out" | extract_tag latest)
            if [ -z "$latest" ]; then
                echo "::error::${pkg} is on the registry but has no latest dist-tag (${out}); set it by hand before releasing" >&2
                return 1
            fi
            printf "%s" "$latest"
            return 0
        fi
        if grep -q E404 "$err"; then
            rm -f "$err"
            echo "· ${pkg} is not on the registry yet" >&2
            return 0
        fi
        echo "· npm view ${pkg} dist-tags failed (attempt ${attempt}/${attempts}); retrying in ${pause}s" >&2
        sleep "$pause"
    done
    cat "$err" >&2
    rm -f "$err"
    echo "::error::could not read the dist-tags of ${pkg} from the registry" >&2
    return 1
}

cmd_get() {
    local pkg="$1" tag="$2" out
    out=$(npm view --prefer-online "$pkg" dist-tags --json 2> /dev/null || true)
    printf "%s" "$out" | extract_tag "$tag"
}

case "${1:-}" in
    pick) cmd_pick "${2:?version}" "${3-}" ;;
    current-latest) cmd_current_latest "${2:?package}" ;;
    get) cmd_get "${2:?package}" "${3:?dist-tag}" ;;
    *)
        echo "usage: $0 pick <version> <current-latest> | current-latest <package> | get <package> <dist-tag>" >&2
        exit 2
        ;;
esac
