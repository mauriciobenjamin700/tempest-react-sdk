# Mapa do Brasil & localidades

Mapa nacional **clicável** das 27 unidades federativas + dataset de estados e cidades — **sem nenhuma API paga ou externa**. A geometria é um GeoJSON do IBGE **simplificado e empacotado** no SDK (renderizado como SVG), e a lista de localidades espelha o `utils/locations` do [`tempest-fastapi-sdk`](https://pypi.org/project/tempest-fastapi-sdk/).

!!! info "Import pelo subpath `tempest-react-sdk/br`"
    Este módulo empacota dados (nomes de ~5600 cidades + geometria das UFs). Pra não pesar no bundle de quem não usa, ele vive num **subpath separado** — importe de `tempest-react-sdk/br`, não da raiz. A geometria do mapa ainda carrega **lazy** (só quando o `BrazilMap` monta).

    ```ts
    import { BrazilMap, citiesByUf } from "tempest-react-sdk/br";
    ```

## Quando usar

- Um **mapa do Brasil clicável** pra selecionar um estado (dashboards, filtros regionais).
- **Choropleth**: pintar estados por uma métrica (vendas, usuários, cobertura).
- Um **seletor Estado → Cidade** encadeado em formulários.
- Consultar estados/cidades/regiões offline (`citiesByUf`, `ufChoices`, ...).

---

## Parte 1 — Dados de localidade

Comece pelos dados: funções puras, sem rede, disponíveis imediatamente.

```ts
import {
  listStates,
  getState,
  citiesByUf,
  statesByRegion,
  ufChoices,
  isValidUf,
  normalizeUf,
} from "tempest-react-sdk/br";

listStates().length; // 27 (ordenados por nome)

getState("sp");
// { uf: "SP", name: "São Paulo", region: "Sudeste", cities: [...] }

citiesByUf("RJ");     // ["Angra dos Reis", "Aperibé", ..., "Rio de Janeiro", ...]
citiesByUf("XX");     // [] — UF inválida devolve lista vazia (não lança)

statesByRegion("Sul").map((s) => s.uf); // ["PR", "RS", "SC"]

normalizeUf(" rj "); // "RJ"
normalizeUf("zz");   // null
isValidUf("mg");     // true
```

!!! tip "Coleções vazias não são erro"
    `citiesByUf` de uma UF inexistente devolve `[]`, não lança. Segue a convenção do backend: "sem correspondência" é um resultado válido.

### Alimentar um `<Select>` / `<Combobox>`

`ufChoices()` e `cityChoices(uf)` já devolvem `{ value, label }`:

```tsx
import { Select } from "tempest-react-sdk";
import { ufChoices } from "tempest-react-sdk/br";

<Select label="Estado" placeholder="Selecione" options={ufChoices()} />;
```

---

## Parte 2 — Seletor Estado → Cidade

O `BrazilStateCitySelect` encadeia dois selects: escolher o estado filtra as cidades daquele UF. A cidade reseta quando o estado muda.

```tsx
import { BrazilStateCitySelect } from "tempest-react-sdk/br";

export function EnderecoForm() {
  return (
    <BrazilStateCitySelect
      onChange={({ uf, city }) => console.log(uf, city)}
      stateLabel="UF"
      cityLabel="Município"
    />
  );
}
```

- `defaultUf` / `defaultCity` — valores iniciais (não-controlado).
- `onChange({ uf, city })` — dispara a cada mudança; `uf`/`city` são `null` quando vazios.
- `layout="column"` empilha os selects (default é lado a lado).
- `disabled` trava ambos.

!!! note "Cidade só habilita depois do estado"
    O select de cidade fica desabilitado até um estado ser escolhido — não há o que listar antes disso.

---

## Parte 3 — O mapa `BrazilMap`

Mapa SVG das 27 UFs, com auto-fit, rótulos de sigla e clique por estado. Nenhum tile externo.

### Mapa clicável

```tsx
import { useState } from "react";
import { BrazilMap, type UF } from "tempest-react-sdk/br";

export function SeletorNoMapa() {
  const [uf, setUf] = useState<UF | null>(null);
  return (
    <>
      <BrazilMap selected={uf} onSelect={setUf} height={440} />
      {uf && <p>Selecionado: {uf}</p>}
    </>
  );
}
```

- `onSelect(uf)` dispara no clique (e no Enter/Espaço — os estados são focáveis quando há `onSelect`).
- `selected` aceita uma UF **ou uma lista** — útil pra seleção múltipla.
- Cada estado tem `<title>` (tooltip nativo) e `aria-label` com o nome — acessível por padrão.

### Choropleth (tinta por métrica)

Passe `values` (um número por UF) e cada estado é tingido linearmente entre `minColor` e `maxColor`:

```tsx
import { BrazilMap } from "tempest-react-sdk/br";

const vendas = { SP: 1200, MG: 640, RJ: 580, BA: 410, RS: 390 };

<BrazilMap
  values={vendas}
  minColor="#e0f2fe"
  maxColor="#0369a1"
  showLabels={false}
/>;
```

Estados sem valor ficam com a cor base de superfície.

### Mapa + cidades (receita completa)

O caso que motivou o módulo: clicar no mapa e listar as cidades do estado.

```tsx
import { useState } from "react";
import {
  BrazilMap,
  BrazilStateCitySelect,
  getState,
  type UF,
} from "tempest-react-sdk/br";

export function MapaNacional() {
  const [uf, setUf] = useState<UF | null>(null);
  const estado = uf ? getState(uf) : null;

  return (
    <div>
      <BrazilMap selected={uf} onSelect={setUf} height={440} />

      {estado && (
        <section>
          <h3>
            {estado.name} — {estado.cities.length} cidades
          </h3>
          <BrazilStateCitySelect
            key={uf}
            defaultUf={uf!}
            onChange={({ city }) => console.log("cidade:", city)}
          />
        </section>
      )}
    </div>
  );
}
```

!!! tip "Reset ao trocar de estado"
    O `key={uf}` remonta o seletor quando a UF muda pelo mapa, garantindo que a cidade zere.

### Props do `BrazilMap`

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `selected` | `UF \| UF[] \| null` | — | UF(s) destacada(s). |
| `onSelect` | `(uf: UF) => void` | — | Clique/teclado num estado. |
| `values` | `Partial<Record<UF, number>>` | — | Métrica por UF → choropleth. |
| `minColor` / `maxColor` | `string` | tons de primary | Extremos da escala do choropleth. |
| `height` | `number` | `440` | Altura do viewport em px. |
| `padding` | `number` | `12` | Margem interna em px. |
| `showLabels` | `boolean` | `true` | Sigla no centroide de cada UF. |
| `label` | `string` | `"Mapa do Brasil por estado"` | Rótulo acessível da região. |

---

## Sobre a geometria

- Fonte: fronteiras das UFs do **IBGE** (domínio público), simplificadas com Douglas-Peucker (~2 km de tolerância) e arredondadas a 3 casas decimais.
- Tamanho: **~119 KB cru / ~36 KB gzip**, num chunk à parte carregado **lazy** pelo `BrazilMap`.
- Precisão: adequada pra um **mapa de visão geral clicável**, **não** pra análise geográfica precisa nem cálculo de área.

!!! warning "Nível de município no mapa"
    O mapa desenha **estados**, não municípios — os 5570 polígonos municipais não cabem num bundle. Pra drill-down de cidade, use o **seletor** (`BrazilStateCitySelect`) ou desenhe você mesmo com um GeoJSON de municípios **que você hospeda** (via o `<TrajectoryMap>`/projeção do módulo [Geolocalização](./geo.md), ou Leaflet).

## Acesso avançado à geometria

Precisa do GeoJSON pra um render próprio? Carregue-o lazy:

```ts
import { loadBrUfGeoJson } from "tempest-react-sdk/br";

const collection = await loadBrUfGeoJson();
collection.features.length; // 27
```

---

## Recap

- **Dados**: `listStates`, `getState`, `citiesByUf`, `statesByRegion`, `ufChoices`, `cityChoices`, `isValidUf`, `normalizeUf`, `isValidCity` — offline, espelhando o `utils/locations` do FastAPI SDK.
- **Seletor**: `BrazilStateCitySelect` encadeia Estado → Cidade.
- **Mapa**: `BrazilMap` renderiza as 27 UFs em SVG — clicável (`onSelect`), destacável (`selected`) e choropleth (`values`). Zero tile externo; geometria empacotada e lazy.
- **Import** sempre pelo subpath `tempest-react-sdk/br`.

## Veja também

- [Geolocalização](./geo.md) — coleta de lat/lon, trajetória e `TrajectoryMap` (tile-free)
- [Forms BR](./forms-br.md) — CPF/CNPJ/CEP e `useViaCEP`
- [Componentes: Entrada de dados](./components/inputs.md) — `Select`, `Combobox`
