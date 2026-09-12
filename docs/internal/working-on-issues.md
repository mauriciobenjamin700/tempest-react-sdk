# Como trabalhar uma issue aqui

O backlog vive nas **issues do GitHub** (`gh issue list`), nunca neste repo em
markdown. Uma lista em arquivo fica velha e ninguém nota.

## De onde as issues vêm

**De adoção, não de planejamento.** As últimas oito nasceram de subir o SDK num
app real: `alofans-frontend`, `servus-frontend`, `tempest-mirror-screen` (mesh
WebRTC) e `tempest-zap` (mensageiro). Nenhuma teria sido escrita olhando o código
do SDK.

Corolário prático: **adotar é a etapa que encontra o defeito.** A issue de
implementação passa; a de uso reprova. A primitiva sai de código que já roda em
produção em algum consumidor, não de desenho especulativo.

## Reproduza o número antes de aceitar a explicação

**Cinco das últimas oito issues estavam erradas sobre a própria causa**, e em
todas o defeito real era maior que o relatado:

| Issue | O que ela dizia | O que a medição mostrou |
| --- | --- | --- |
| #295 | "componente cujo fundo não acompanha o tema", 7 seletores | O SDK nunca declarou `color-scheme` — alcança popup de `<select>`, scrollbar, autofill. E 4 dos 7 seletores **não** deviam ser corrigidos |
| #294 | critério de linter | O da issue dá 56% de precisão; a variante com piso de um segmento dá 5/5 |
| #301 | "ler `globalThis.process?.env` como fallback" | Isso **quebraria** o webpack, o único ambiente que funcionava |
| #319 | "default `focusRingAlpha: 1`" | Opaco no `500` passa em 58 de 96 pares; o degrau escolhido por medição passa em 96 |
| #327 | "não é alcançável por teclado nenhum" | Setas e Escape já funcionavam; faltava foco ao abrir e `Home`/`End` |

A implementação "conforme pedido" teria fechado cada uma delas deixando o defeito
no lugar. Medir antes de implementar não é zelo — é o que separa fechar a issue
de corrigir o bug.

## Roteiro

1. **`git fetch` e olhe a `main` antes de começar.** Já aconteceu de duas frentes
   serem resolvidas em paralelo por outra máquina — e a versão de lá estar certa
   onde a local estava errada.
2. **Reproduza o número da issue.** Escreva a medição, não a impressão.
3. **`git worktree add`** próprio para a tarefa, de uma base limpa.
4. Implemente com teste nomeado pelo que garante; se a medição contradisse a
   issue, a tabela da medição entra na docstring ou no teste.
5. Mudança visual: **valide em browser real** (ver `conventions.md`).
6. Doc bilíngue + CHANGELOG no mesmo commit.
7. `npm run lint`, `npm run typecheck`, `npm run test:run`,
   `npm run format:check`, `npx size-limit`.
8. PR no template PT-BR, com `Closes #N` em linha própria e os números medidos
   na seção de validação.

## Quando a issue está errada, diga

Contestar faz parte do trabalho: o #173 respondeu que o subpath pedido
economizaria **zero** porque o tree-shaking já separava, e essa resposta valeu
mais que a implementação. Escreva o número que sustenta a contestação no corpo do
PR — é o que impede a mesma proposta de voltar em seis meses.
