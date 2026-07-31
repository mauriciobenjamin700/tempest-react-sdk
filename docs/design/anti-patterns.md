# Anti-padrões

As páginas anteriores dizem o que fazer. Esta diz o que você vai **encontrar** —
num app existente, ou num PR seu de sexta-feira à noite.

Cada entrada tem o mesmo formato: como reconhecer, por que dói, e o refactor.

## 1. O componente Deus

**Reconhecer:** um `.tsx` com 400+ linhas, `useState` misturado com `fetch`,
formatação, validação e JSX.

**Dói porque:** cinco motivos de mudança num arquivo — toda alteração tem chance
de quebrar algo não relacionado, e ninguém lê o arquivo inteiro antes de editar.

**Refactor:** três cortes, nesta ordem.

1. `fetch` → [serviço](data-flow.md).
2. Estado + handlers → [hook](components.md#logic-to-hook).
3. Blocos de JSX → sub-componentes.

Sempre nessa ordem: tirar a rede primeiro é o que torna o resto testável.

## 2. `fetch` dentro do componente

**Reconhecer:**

```tsx
useEffect(() => {
  fetch(`/api/orders?page=${page}`)
    .then((r) => r.json())
    .then(setOrders);
}, [page]);
```

**Dói porque:** intestável sem servidor, sem cache, sem dedupe, sem tratamento de
erro, sem cancelamento — e o mesmo endpoint chamado em duas telas dispara dois
requests.

**Refactor:** serviço + `useQuery`. Vira uma linha no componente:

```tsx
const { data = [], isLoading } = useOrders(page);
```

Ver [Fluxo de dados](data-flow.md).

## 3. `useEffect` de sincronização

**Reconhecer:** `useEffect` cujo corpo só chama `setState` a partir de outro
estado ou prop.

```tsx
useEffect(() => {
  setFullName(`${first} ${last}`);
}, [first, last]);
```

**Dói porque:** render extra, uma janela em que o valor está velho, e uma segunda
fonte de verdade.

**Refactor:** calcule.

```tsx
const fullName = `${first} ${last}`;
```

Ver [Onde mora cada estado](state.md#derived).

## 4. Estado de servidor duplicado no store

**Reconhecer:** `useOrdersStore` com um array de pedidos que vem da API, mais um
`fetchOrders()` que preenche o array.

**Dói porque:** você reimplementou cache — mas sem invalidação, sem revalidação,
sem `staleTime`. O sintoma é sempre "a tela não atualiza depois do POST".

**Refactor:** dado de servidor → [Query](../query.md). O store fica só com o que é
de cliente (sessão, tema, carrinho).

## 5. Prop drilling de 4 níveis

**Reconhecer:** a mesma prop atravessando componentes que não a usam, só pra
chegar no neto do neto.

**Dói porque:** todo componente do caminho conhece um dado que não é dele, e
adicionar um campo mexe em cinco arquivos.

**Refactor:** três opções, na ordem:

1. **Composição** — passe `children` já montado, em vez de dados pro filho montar.
2. **Contexto** — quando é realmente global (tema, sessão, i18n).
3. **Store** — quando é global **e** muda com frequência.

!!! warning "Contexto não é a primeira resposta"
    Contexto re-renderiza todo consumidor quando o valor muda. Composição resolve
    a maioria dos casos de drilling sem custo nenhum de render.

## 6. Pass-through {#passthrough}

**Reconhecer:** função, hook ou componente cujo corpo só repassa os argumentos.

```ts
// ❌ camada sem lógica nenhuma
export async function listCustomers(params: GetListParams) {
  return dataProvider.getList<Customer>("customers", params);
}
```

**Dói porque:** é uma indireção a mais pra ler, um arquivo a mais pra abrir, e
zero comportamento adicionado. E quando a assinatura de baixo muda, você mexe em
dois lugares.

**Refactor:** apague e chame direto — `useList<Customer>("customers", params)`.

Exceções legítimas: fronteira de abstração intencional (fachada pública sobre
implementação privada, hook de framework, implementação de interface). Se for o
caso, o JSDoc diz que é.

## 7. Cerimônia {#cerimonia}

**Reconhecer:** camada criada por simetria, não por necessidade — `types/`,
`constants/`, `mappers/` com um arquivo de duas linhas cada, um `mapper` que copia
campo por campo sem transformar nada.

```ts
// ❌ mapeia A em A
export function toOrder(dto: OrderDto): Order {
  return { id: dto.id, code: dto.code, status: dto.status };
}
```

**Dói porque:** cada camada vazia é mais um lugar pra procurar e mais um pra
manter em sincronia, em troca de nada.

**Refactor:** delete. Estrutura se adiciona quando o segundo caso aparece, não
antes.

## 8. Barrel gigante no app

**Reconhecer:** um `src/index.ts` (ou `components/index.ts`) reexportando tudo, e
imports do tipo `import { X } from "@/components"`.

**Dói porque:** ciclo de import (A → barrel → B → barrel → A), e o Vite
reprocessa a árvore inteira a cada edição — o dev server fica lento sem motivo
aparente.

**Refactor:** barrel só na **fronteira de feature** (`features/orders/index.ts`).
Dentro da feature e dentro de `components/`, caminho direto.

!!! note "No SDK é diferente — de propósito"
    Um pacote publicado precisa do barrel: é o contrato de import do consumidor. O
    custo é pago com `preserveModules` no build, que preserva o grafo de módulos
    para o bundler do app tree-shakear. App não publica nada, então não tem esse
    problema pra resolver.

## 9. `any` e `as` pra calar o compilador

**Reconhecer:** `as any`, `@ts-ignore`, `props: any`, `!` espalhado.

**Dói porque:** o erro não desaparece — ele muda de lugar, pra runtime, longe da
causa.

**Refactor:** `unknown` + validação na borda, union discriminada, early return. Ver
[Tipagem forte](typing.md).

## 10. Booleana como variante

**Reconhecer:** `<Alert error warning info small />`.

**Dói porque:** representa estados impossíveis (`error warning` juntos) e a
precedência fica escondida no CSS.

**Refactor:** `union` de string — `<Alert variant="error" size="sm" />`.

## 11. Teste acoplado à implementação

**Reconhecer:** `container.querySelector(".tempest_card_1a2b")`, snapshot de 400
linhas, assert de que `useState` foi chamado.

**Dói porque:** falha quando o CSS muda e passa quando o comportamento quebra.
Confiança falsa é pior que nenhum teste.

**Refactor:** consulte por papel (`getByRole`) e verifique comportamento
observável. Ver [Estratégia de testes](testing.md).

## 12. `catch` silencioso

**Reconhecer:**

```ts
try {
  await payOrder(id);
} catch {
  // ignora
}
```

**Dói porque:** troca um erro visível por um comportamento errado invisível. O
usuário clica, nada acontece, e não existe log.

**Refactor:** trate (mensagem específica), ou **não capture** — deixe subir pro
[ErrorBoundary](../error-boundary.md) e registre no [logger](../logger.md).

## 13. Hardcode de string mágica

**Reconhecer:** `if (status === "paid")` em sete arquivos; `["orders", "list", page]`
montado à mão na query e na invalidação.

**Dói porque:** o typo não é erro de compilação. `"payed"` num dos sete arquivos
é um `if` que nunca entra.

**Refactor:** union + constante derivada. Query key via
[`createQueryKeys`](../query.md); rótulo via tabela `satisfies Record<Status, string>`
([Tipagem](typing.md#satisfies)).

## 14. Estilo inline em vez de token

**Reconhecer:** `style={{ color: "#2563eb", padding: 12 }}`.

**Dói porque:** não respeita tema dark, não respeita densidade, não tem estado
(`:hover`/`:focus-visible`) e vira 40 tons de azul diferentes pelo app.

**Refactor:** CSS Module + tokens `--tempest-*`:

```css
.card {
  color: var(--tempest-text);
  background: var(--tempest-surface);
  padding: var(--tempest-space-3);
}
```

Ver [Estilos & Design Tokens](../styles.md).

!!! tip "`tempest doctor` acha parte disso"
    O CLI analisa o CSS do projeto: propriedade e token inexistentes, declaração
    duplicada, sintaxe que o browser derruba, bloco repetido que pede classe
    utilitária.

    ```bash
    npx tempest doctor
    npx tempest fix --dry-run
    ```

## 15. Reimplementar o que o SDK tem

**Reconhecer:** um `Modal` próprio, um `useDebounce` próprio, um `formatCurrency`
próprio, uma máscara de CPF própria.

**Dói porque:** foco-trap, `Esc`, restauração de foco, `aria-modal`, scroll lock e
portal são seis detalhes que a versão caseira não tem — e cada um é um bug de
acessibilidade.

**Refactor:** procure primeiro. São 117 componentes, 46 hooks, utilitários BR
(CPF/CNPJ/CEP/telefone/moeda) e 384 exports na raiz. Ver
[catálogo de componentes](../components.md), [hooks](../hooks.md),
[utilitários](../utilities.md).

## O ranking, se você só puder atacar três

| Prioridade | Anti-padrão                       | Por quê                                         |
| ---------- | --------------------------------- | ----------------------------------------------- |
| 🔴 1       | `fetch` no componente             | bloqueia teste, cache e reuso de uma vez        |
| 🔴 2       | Estado de servidor duplicado      | causa direta de "tela com dado velho"           |
| 🔴 3       | `any` / `as` pra calar erro       | move o bug pra produção                         |
| 🟡 4       | Componente Deus                   | doloroso, mas melhora incremental funciona      |
| 🟡 5       | `catch` silencioso                | barato de corrigir, alto retorno                |
| 🟢 6       | Cerimônia / pass-through          | irritante, não perigoso                         |

## Recap

- Os três caros: **`fetch` no componente**, **estado de servidor duplicado**,
  **`any` pra calar o compilador**.
- Componente Deus se resolve em ordem: rede → lógica → JSX.
- `useEffect` que só faz `setState` é estado derivado disfarçado.
- Pass-through e cerimônia são custo sem retorno — delete.
- Antes de escrever primitivo, procure no SDK.

Próxima: [Checklist de revisão](checklist.md) — a versão de uma página.
