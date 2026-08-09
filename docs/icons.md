# Ícones por slug

Todo componente do SDK que aceita ícone aceita um `ReactNode`:

```tsx
import { Button } from "tempest-react-sdk";
import { Save } from "lucide-react";

<Button leftIcon={<Save size={18} />}>Salvar</Button>;
```

Isso resolve o caso em que **você sabe o ícone na hora de escrever o código**. Mas
às vezes o nome do ícone chega pronto: um menu que a API devolve, um cadastro no
CMS, uma tabela de configuração. Aí não há o que importar — só existe a string
`"layout-dashboard"`.

É pra isso que existe o subpath `tempest-react-sdk/icons`. 🚀

## O caminho mais curto

```tsx
import { Icon } from "tempest-react-sdk/icons";

export function Toolbar() {
    return (
        <div>
            <Icon name="save" size={18} />
            <Icon name="trash-2" size={18} />
        </div>
    );
}
```

Pronto — sem provider, sem configuração. Os **1997 slugs** do lucide funcionam
assim, incluindo nome que só existe em runtime:

```tsx
<Icon name={row.iconSlug} />
```

!!! info "Slug é kebab-case, não PascalCase"
    O nome é o do lucide em kebab-case: `"circle-alert"`, não `"CircleAlert"`.
    `"trash-2"`, não `"Trash2"`. Em dev, um nome errado sai no console com essa
    dica.

## Não instale `lucide-react` você mesmo

O `lucide-react` é **dependência direta do SDK** — instalar ele no seu app é o que
cria problema, não o que resolve.

```bash
npm uninstall lucide-react
```

!!! danger "Duas cópias de lucide = bytes duplicados e tabela de slug quebrada"
    Se o seu `package.json` declara `lucide-react` numa faixa diferente da do SDK,
    o gerenciador instala **duas cópias físicas**. Dois efeitos, e o segundo é o
    grave:

    1. **Bytes duplicados** no bundle — o app importa da cópia dele, o SDK da
       cópia dele, e nenhuma das duas é tree-shaken pela outra.
    2. **Skew de versão**: as tabelas de slug do `/icons` são **geradas** contra a
       versão que o SDK declara (`^1.26.0`). Uma segunda cópia mais antiga pode não
       ter exports que as tabelas referenciam, e aí o erro aparece no build do app
       como `X is not exported by lucide-react` — apontando pra dentro do SDK, o
       que torna a causa difícil de achar.

    A regra: **uma cópia só**, a que o SDK trouxe.

!!! info "Se você importa componentes do lucide direto"
    Usando só `<Icon name="…" />`, não precisa declarar lucide em lugar nenhum.

    Se você também escreve `import { Save } from "lucide-react"` no seu código, o
    que acontece depende do gerenciador:

    - **npm / yarn** — hoisting deixa a cópia do SDK visível na raiz do seu
      `node_modules`, então o import resolve sem você declarar nada. É o caminho
      recomendado.
    - **pnpm** (isolamento estrito) — o app não vê dependência que não declarou,
      então você **precisa** declarar. Nesse caso use **a mesma faixa do SDK**
      (`"lucide-react": "^1.26.0"`) pra continuar existindo uma cópia só.

!!! tip "Confirme que sobrou uma"
    ```bash
    npm ls lucide-react
    ```
    Mais de uma linha na saída (ou uma cópia aninhada em
    `node_modules/tempest-react-sdk/node_modules/`) significa duas instâncias —
    rode `npm dedupe`, e se persistir, remova a declaração do seu `package.json`.

## Por que não `DynamicIcon` do lucide

O `lucide-react` traz um `DynamicIcon` que parece resolver o mesmo problema. Ele
tem um custo que inviabiliza o uso:

!!! danger "`DynamicIcon` gera ~2000 fronteiras de chunk"
    O mapa que ele usa (`dynamicIconImports`) é um módulo de **116 KB** com uma
    chamada `import()` para **cada** um dos 1997 ícones. Qualquer bundler que veja
    esse módulo é obrigado a criar um chunk por ícone: no build de produção isso
    vira ~1997 arquivos minúsculos, e em desenvolvimento vira uma enxurrada de
    requisições no navegador.

    Além disso ele resolve o ícone **depois** da renderização (num `useEffect`), então
    o primeiro quadro nunca tem ícone e o layout pula. E um nome inexistente faz
    `throw`, derrubando a árvore React — justamente no caso em que o nome vem de
    fora.

O `<Icon>` do SDK troca isso por **um chunk por letra inicial**. Renderizar 130
ícones diferentes pede 9 requisições, não 130:

```console
GET .../icons/generated/shard-s.js   200
GET .../icons/generated/shard-t.js   200
GET .../icons/generated/shard-c.js   200
… uma por letra usada, no máximo 25
```

O maior shard (`s`, com 247 ícones) pesa **19 KB brotli**; a mediana fica em
~2,4 KB. E `{ Icon }` sozinho custa **2,95 KB brotli** no bundle inicial.

## Custo zero de requisição para os slugs que você escreveu

Um `<Icon name="save" />` escrito no código não precisa de shard nenhum: o slug é
conhecido em tempo de build. O plugin `tempestIcons()` varre o seu source, acha
esses nomes e gera um registro com imports estáticos comuns.

### 1. Ligue o plugin

Se você usa `createViteConfig`, **já está ligado** — o plugin entra por default:

```ts
// vite.config.ts
import { createViteConfig } from "tempest-react-sdk/vite";

export default createViteConfig();
```

Config manual? Adicione o plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tempestIcons } from "tempest-react-sdk/vite";

export default defineConfig({
    plugins: [react(), tempestIcons()],
});
```

### 2. Passe o registro pro provider

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { IconProvider } from "tempest-react-sdk/icons";
import { staticIcons } from "virtual:tempest-icons";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(
    <IconProvider registry={staticIcons} size={18}>
        <App />
    </IconProvider>,
);
```

### 3. Declare o tipo do módulo virtual

```ts
// src/vite-env.d.ts
/// <reference types="tempest-react-sdk/icons/virtual" />
```

Feito isso, todo slug literal do seu código resolve **no primeiro frame, sem
requisição extra**. Slug de runtime continua caindo no shard — o comportamento não
muda, só fica mais barato onde dá.

!!! tip "O provider também guarda os defaults"
    `size` e `strokeWidth` no `IconProvider` valem pra toda a subárvore, então você
    para de repetir `size={18}` em cada chamada. Prop explícita no `<Icon>` sempre
    ganha do default.

## Nome que não existe

Nunca lança. Sem `fallback`, não renderiza nada:

```tsx
<Icon name="nao-existe" />
```

Com `fallback`, renderiza o que você mandar — inclusive um placeholder do mesmo
tamanho, pra o layout não pular enquanto o shard está no ar:

```tsx
<Icon
    name={row.iconSlug}
    size={20}
    fallback={<span style={{ width: 20, height: 20 }} />}
/>
```

Em **desenvolvimento** sai um `console.warn` uma vez por slug, e só quando o nome é
realmente inexistente — nunca enquanto um ícone válido está carregando.

!!! warning "Valide na borda, não no componente"
    Se o nome vem de fora, decida o fallback **uma vez**, onde o dado entra:

    ```tsx
    import { isIconName } from "tempest-react-sdk/icons";

    const slug = isIconName(row.icon) ? row.icon : "circle-help";
    ```

    `isIconName` importa a lista completa de slugs (~6 KB brotli). O `<Icon>` **não**
    importa essa lista — só pague por ela onde precisa validar ou listar.

## Slug antigo continua funcionando

O lucide renomeou vários ícones (`alert-circle` → `circle-alert`,
`alert-triangle` → `triangle-alert`) e mantém os 248 nomes antigos como alias. O
SDK carrega esse mapa, então um slug gravado no banco há dois anos ainda renderiza:

```tsx
<Icon name="alert-circle" />  {/* renderiza circle-alert */}
```

O alias resolve pro nome canônico **antes** de escolher o shard, então
`alert-circle` puxa o shard `c`, não o `a`.

## Aquecendo os shards

Antes de abrir um menu grande ou um seletor de ícone, dá pra carregar os shards
enquanto o usuário ainda está indo com o mouse:

```tsx
import { preloadIcons } from "tempest-react-sdk/icons";

<button onMouseEnter={() => void preloadIcons(MENU.map((i) => i.name))}>Menu</button>;
```

Depois disso os ícones aparecem no primeiro frame, sem passar pelo `fallback`.

## Sem Vite? Use o CLI

O plugin é a forma mais confortável, mas não é a única. O CLI gera o mesmo
registro como um arquivo de verdade, que você versiona:

```bash
npx tempest gen icons --out src/icons.generated.ts
```

```console
→ scanning src

✓ 37 icon(s) from 42 file(s) → src/icons.generated.ts

Wire it up:
  import { IconProvider } from "tempest-react-sdk/icons";
  import { icons } from "@/icons.generated";
  <IconProvider registry={icons}>…</IconProvider>
```

Re-rode depois de adicionar ícones novos. Um slug que o scan não vê (nome montado
por concatenação, por exemplo) continua funcionando pelo shard — só não ganha o
caminho estático.

## Montando um seletor de ícone

`iconNames` é a lista completa, ordenada:

```tsx
import { useMemo, useState } from "react";
import { Icon, iconNames } from "tempest-react-sdk/icons";

export function IconPicker({ onPick }: { onPick: (slug: string) => void }) {
    const [query, setQuery] = useState("");
    const matches = useMemo(
        () => iconNames.filter((name) => name.includes(query.trim().toLowerCase())),
        [query],
    );

    return (
        <div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
            <p>
                {matches.length} de {iconNames.length}
            </p>
            {matches.slice(0, 120).map((name) => (
                <button key={name} onClick={() => onPick(name)} title={name}>
                    <Icon name={name} size={20} />
                </button>
            ))}
        </div>
    );
}
```

Veja rodando na [gallery](./gallery.md), seção **Ícones por slug**.

## Lista completa, para consultar fora do app

O backend que grava o slug — o seed de categorias, a tabela do admin, a
validação do Pydantic — não consegue importar `iconNames`. Para esses casos a
lista sai publicada junto com esta documentação, gerada pelo mesmo script que
gera as tabelas do SDK, então ela nunca fica atrasada em relação ao que o
`<Icon>` aceita:

| Arquivo                                     | O que tem                                                    |
| ------------------------------------------- | ------------------------------------------------------------ |
| [`icon-slugs.txt`](assets/icon-slugs.txt)   | Os 1749 slugs **canônicos**, um por linha                     |
| [`icon-slugs.csv`](assets/icon-slugs.csv)   | Os 1997 slugs com `status` (`canonical`/`deprecated`) e o canônico correspondente |

Use o `.txt` para o que **valida escrita** — é a lista do que pode ser gravado
hoje. Use o `.csv` para o que **lê dado antigo**: a coluna `canonical` diz para
onde cada nome depreciado resolve, que é a mesma resolução que o `<Icon>` faz em
runtime.

!!! tip "Validando no backend Python"
    ```python
    from pathlib import Path

    ICON_SLUGS: frozenset[str] = frozenset(
        Path("icon-slugs.txt").read_text().split()
    )

    if category.icon_code not in ICON_SLUGS:
        raise ValueError(f"{category.icon_code!r} is not a lucide icon slug")
    ```

!!! warning "Vocabulário: é lucide, não Material Symbols"
    Se o seu seed veio de um app Android/Flutter, os códigos são Material Symbols
    em `snake_case` (`format_paint`, `electrical_services`) e **nenhum** deles é
    um slug lucide. Pior: um punhado colide por acidente (`settings`, `code`,
    `key`, `lock`, `shield`, `tv`) e renderiza certo em ~10% das linhas, o que
    faz o problema parecer "sumiram alguns ícones". Converta o vocabulário antes
    de gravar.

## Referência

| Export               | O que faz                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `Icon`               | Renderiza por slug. Props: `name`, `size`, `strokeWidth`, `fallback` + SVG |
| `IconProvider`       | Registro estático + defaults de `size`/`strokeWidth`                    |
| `createIconRegistry` | Monta um registro a partir de componentes lucide importados             |
| `useIcon`            | Resolve um slug pro componente (o que o `Icon` usa por dentro)          |
| `preloadIcons`       | Aquece os shards de uma lista de slugs                                  |
| `iconStatus`         | `"ready"` / `"loading"` / `"missing"` para um slug                      |
| `peekIcon`           | Lê do cache sem disparar carregamento                                   |
| `loadIcon`           | Carrega o shard de um slug                                              |
| `resolveIconAlias`   | Slug depreciado → slug canônico                                        |
| `isIconName`         | Type guard contra a lista real (importa a lista)                        |
| `iconNames`          | Os 1997 slugs, ordenados (~6 KB brotli)                                 |
| `iconAliases`        | Os 248 pares alias → canônico                                          |
| `IconName`           | União de tipo com todos os slugs (só tipo, custo zero)                  |

### Custos medidos

| O que                                       | Brotli    |
| ------------------------------------------- | --------- |
| `{ Icon }` no bundle inicial                | 2,95 KB   |
| `+ { iconNames }`                           | +5,7 KB   |
| Maior shard (`s`, 247 ícones), sob demanda  | 19,2 KB   |
| Shard mediano (`w`, 40 ícones), sob demanda | ~2,4 KB   |
| Todos os 25 shards somados (teto absoluto)  | ~124,5 KB |

## Recap

- `<Icon name="save" />` resolve qualquer um dos **1997 slugs** do lucide, sem
  configuração.
- Slug **literal** vira import estático via `tempestIcons()` (ligado por default no
  `createViteConfig`) → **zero requisição extra**.
- Slug de **runtime** carrega **um shard por letra inicial** — no máximo 25
  requisições, nunca uma por ícone.
- Nome inexistente renderiza `fallback` (nada, por default) e **nunca lança**;
  `console.warn` só em dev.
- Os 248 **aliases** antigos do lucide continuam resolvendo.
- `iconNames` fica **fora** do custo do `<Icon>` — importe só se for listar ou
  validar.
- **Não declare `lucide-react` no seu app**: ele já vem com o SDK, e uma segunda
  cópia duplica bytes e pode não ter os exports que as tabelas de slug geradas
  referenciam.
- Veja também: [Vite & alias](./vite-config.md) · [CLI tempest](./cli.md) ·
  [Componentes](./components.md)
