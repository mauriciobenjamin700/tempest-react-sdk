# Changesets

Releases tracked via [changesets](https://github.com/changesets/changesets).

## Fluxo

```bash
# 1. Após mudanças funcionais, descrever:
npx changeset

# 2. Bump de versão + atualizar CHANGELOG:
npx changeset version

# 3. Publicar no npm:
npm run release
```

Cada changeset markdown na pasta descreve uma mudança e o tipo (`patch` / `minor` / `major`). Commitar junto com a PR.
