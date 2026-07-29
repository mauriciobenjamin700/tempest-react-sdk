# Checklist de revisão

Toda a seção em uma página. Use antes de abrir o PR e durante a revisão do PR de
outra pessoa.

!!! tip "Copie pro seu repositório"
    Vale colar esta lista em `.github/pull_request_template.md`. Checklist que
    aparece sozinho no formulário do PR é usado; checklist que mora num wiki não é.

## Antes de abrir o PR

### Camadas

- [ ] Nenhum componente chama `fetch`/`apiClient` direto.
- [ ] Nenhum import de camada de cima (UI não importa feature, feature não importa
      página).
- [ ] Feature importada de fora só pelo `index.ts` dela.
- [ ] Nenhum `../../../` — só `@/` ou irmão (`./`).
- [ ] Arquivo está na pasta da **feature**, não numa pasta por tipo de arquivo.

### Estado

- [ ] Nada que dê pra calcular está em `useState`.
- [ ] Nenhum `useEffect` cujo corpo só chama `setState`.
- [ ] Dado de servidor está no Query, não em `useState`/store.
- [ ] Filtro/página/aba estão na URL, não duplicados em `useState`.
- [ ] Campo de formulário está no `useZodForm`, não em `useState`.

### Tipos

- [ ] Zero `any`. Zero `@ts-ignore`.
- [ ] Nenhum `as` novo (fora `as const` e estreitamento pós-guard).
- [ ] Tipo do domínio derivado do schema (`z.infer`), não redigitado.
- [ ] Resposta de rede passa por `parseResponse`/schema.
- [ ] Estado com mais de um caso é **union discriminada**, não flags booleanas.
- [ ] Variante de componente é `union` de string, não booleana.
- [ ] Coleção vazia é `[]`, não `null`.
- [ ] `npx tsc -b --noEmit` passa.

### Tamanho

- [ ] `.tsx` ≤ 150 linhas de código — ou JSDoc explicando o motivo de estourar.
- [ ] Função/componente ≤ 80 linhas.
- [ ] Hook ≤ 100 linhas.
- [ ] ≤ 7 props por componente.
- [ ] Aninhamento de JSX ≤ 4.

### Componente

- [ ] Antes de escrever, procurei no [catálogo](../components.md) e nos
      [hooks](../hooks.md) do SDK.
- [ ] Componente de apresentação não conhece domínio nenhum.
- [ ] `...rest` tipado via `HTMLAttributes<T>`, e `className` do chamador entra por
      último no `cn(...)`.
- [ ] Ação é `<button>`, navegação é `<a>` — nunca `<div onClick>`.
- [ ] Todo campo tem `label` associado.
- [ ] Overlay novo: `Esc` fecha, foco preso dentro, foco volta pro gatilho.

### Estilo

- [ ] Nenhum valor de cor/espaço hardcoded — tokens `--tempest-*`.
- [ ] Nenhum `style={{...}}` com o que deveria ser CSS Module.
- [ ] Testado em tema **claro e escuro**.
- [ ] Testado em ≤ 430px e ≥ 1024px.
- [ ] Texto sobre superfície tingida usa o foreground daquela superfície
      (ex. `--tempest-primary-on-soft`), não `--tempest-text-subtle`.

### Erro

- [ ] Nenhum `catch` vazio ou que só faz `console.log`.
- [ ] Erro que a feature não trata **sobe** (não vira toast genérico).
- [ ] A tela tem estado de erro e estado vazio, não só o de sucesso.

### Testes

- [ ] Todo teste novo responde "que bug isso pegaria?".
- [ ] Consulta por papel (`getByRole`), não por classe CSS.
- [ ] Serviço novo tem teste com payload **inválido**, não só o feliz.
- [ ] Nenhum snapshot grande novo.
- [ ] `npm run test:run` e `npm run lint` passam.

### Visual

- [ ] Mudança de UI foi vista **no browser**, não só no `expect`.
- [ ] Console do browser sem erro novo.

## Durante a revisão do PR de outra pessoa

Cinco perguntas que pegam a maior parte dos problemas reais:

1. **Onde esse dado nasce e onde ele morre?** Se a resposta atravessa camadas na
   ordem errada, é aí.
2. **Esse estado tem duas fontes?** Procure `useState` que espelha URL, prop ou
   resposta de API.
3. **O que acontece quando a rede falha?** Se não há resposta no diff, falta
   estado de erro.
4. **Esse teste falharia se eu quebrasse o comportamento?** Se ele só falha com
   mudança de CSS, não é teste.
5. **Isso já existe no SDK?** `Modal`, `useDebounce`, máscara de CPF, formatação
   de moeda — quase sempre sim.

!!! warning "Revisão não é caça a `nit:`"
    Formatação é trabalho do Prettier; ordem de import é do ESLint. Se um
    comentário de revisão pode ser resolvido por ferramenta, configure a
    ferramenta em vez de escrever o comentário. Revisão humana serve pro que
    ferramenta não vê: desenho, fronteira, estado duplicado, caso não tratado.

## Os comandos

```bash
npx tsc -b --noEmit      # tipos, incluindo testes
npx tempest lint         # ESLint
npx tempest fix          # imports (../ → @/), ordem, import morto, CSS morto
npx tempest doctor       # config, env, deps, análise de CSS
npm run test:run         # suíte
npm run test:coverage    # pisos de cobertura
```

Rodar isso antes do push é mais rápido que descobrir no CI.

## Recap

- O checklist é o resumo executável de tudo na seção: camadas, estado, tipos,
  tamanho, componente, estilo, erro, testes, visual.
- Cole no template de PR do repositório — é onde ele é lido.
- Na revisão do outro, as cinco perguntas valem mais que a lista inteira.
- `nit:` de formatação é bug de configuração de ferramenta, não de revisão.

Voltar ao começo: [Design de Software Frontend](index.md).
