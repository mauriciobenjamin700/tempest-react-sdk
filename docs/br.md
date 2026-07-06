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
- Cada estado tem `aria-label` com o nome — acessível por padrão.

!!! tip "Tooltip ao passar o mouse"
    Por padrão (`showTooltip`, default `true`) aparece uma **dica flutuante** ao passar o mouse: **nome, sigla, região e nº de cidades** — e o valor do choropleth quando `values` está setado (ex.: `São Paulo (SP) · Sudeste · 645 cidades`). Passe `showTooltip={false}` pra desligar, ou `renderTooltip={(data) => ...}` pra customizar o conteúdo (`data` = `{ uf, name, value? }`).

    ```tsx
    <BrazilMap
      renderTooltip={({ uf, name, value }) => (
        <><strong>{name}</strong> — {value ?? "sem dado"}</>
      )}
    />
    ```

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

_(veja também o [`BrazilStateMap`](#parte-4-submapa-de-estado-brazilstatemap) para o nível de município.)_


| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `selected` | `UF \| UF[] \| null` | — | UF(s) destacada(s). |
| `onSelect` | `(uf: UF) => void` | — | Clique/teclado num estado. |
| `values` | `Partial<Record<UF, number>>` | — | Métrica por UF → choropleth. |
| `minColor` / `maxColor` | `string` | tons de primary | Extremos da escala do choropleth. |
| `height` | `number` | `440` | Altura do viewport em px. |
| `padding` | `number` | `12` | Margem interna em px. |
| `showLabels` | `boolean` | `true` | Sigla no centroide de cada UF. |
| `showTooltip` | `boolean` | `true` | Dica flutuante (nome + região + nº cidades + valor) no hover. |
| `renderTooltip` | `(data) => ReactNode` | — | Conteúdo custom do tooltip (`{ uf, name, value? }`). |
| `label` | `string` | `"Mapa do Brasil por estado"` | Rótulo acessível da região. |

---

## Parte 4 — Submapa de estado (`BrazilStateMap`)

Um submapa de **um estado** com **todos os seus municípios** clicáveis. A geometria municipal é dividida por UF e carregada **lazy** — abrir o mapa de SP baixa só o chunk de SP (~40-70 KB gzip), nunca os ~2 MB do país inteiro.

```tsx
import { useState } from "react";
import { BrazilStateMap, type Municipality } from "tempest-react-sdk/br";

export function MunicipiosDeSP() {
  const [city, setCity] = useState<Municipality | null>(null);
  return (
    <>
      <BrazilStateMap uf="SP" selected={city?.name} onSelect={setCity} height={420} />
      {city && <p>{city.name} — IBGE {city.id}</p>}
    </>
  );
}
```

- `uf` (obrigatório) — o estado a desenhar.
- `onSelect({ id, name })` — dispara ao clicar num município (`id` = código IBGE de 7 dígitos).
- `selected` — casa por `id` **ou** por `name`; aceita lista.
- `values` — choropleth por município (chave = `id` ou `name`).
- `showLabels` — **`false` por padrão**: um estado tem centenas de municípios e os rótulos se sobrepõem.
- `showTooltip` (default `true`) — dica flutuante no hover com **nome + código IBGE** (+ valor do choropleth quando houver). `renderTooltip={(data) => ...}` customiza (`data` = `{ id, name, value? }`).

### Drill-down nacional → estado (receita)

Combine os dois mapas: clicar no mapa nacional troca o estado do submapa.

```tsx
import { useState } from "react";
import { BrazilMap, BrazilStateMap, type Municipality, type UF } from "tempest-react-sdk/br";

export function DrillDown() {
  const [uf, setUf] = useState<UF>("SP");
  const [city, setCity] = useState<Municipality | null>(null);

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <BrazilMap
        selected={uf}
        onSelect={(u) => {
          setUf(u);
          setCity(null);
        }}
        height={320}
      />
      <BrazilStateMap uf={uf} selected={city?.name} onSelect={setCity} height={320} />
    </div>
  );
}
```

### Choropleth municipal

```tsx
import { BrazilStateMap } from "tempest-react-sdk/br";

<BrazilStateMap
  uf="RJ"
  values={{ "Rio de Janeiro": 100, Niterói: 40, "Duque de Caxias": 55 }}
/>;
```

!!! note "Nomes do mapa × dataset de nomes"
    Os nomes dos municípios no mapa vêm do GeoJSON do IBGE; o `citiesByUf` vem do dataset de nomes. São quase idênticos, mas grafias/acentos podem divergir em casos raros. Para casar valores, prefira o **código IBGE** (`id`) quando tiver.

### Acesso direto à geometria municipal

```ts
import { loadStateMunicipalities } from "tempest-react-sdk/br";

const sp = await loadStateMunicipalities("SP");
sp?.features.length; // 644
```

---

## Parte 5 — Geocoding offline

Converter entre nome/coordenada e município, **sem rede**. Usa um índice compacto de centroides (~97 KB gzip) carregado **lazy** — nenhuma chamada de rede, nenhuma API key.

```ts
import {
  reverseGeocode,
  nearestMunicipality,
  geocodeMunicipality,
  municipalityCentroid,
  stateCentroid,
} from "tempest-react-sdk/br";

// Coordenada → município que a CONTÉM (point-in-polygon, exato):
await reverseGeocode({ latitude: -23.5505, longitude: -46.6333 });
// { id: "3550308", name: "São Paulo", uf: "SP" }

// Coordenada → município de centroide mais próximo (rápido, aproximado, sem geometria):
await nearestMunicipality({ latitude: -23.55, longitude: -46.63 });
// { id, name, uf: "SP", latitude, longitude, distanceKm }

// Nome → coordenada (pode haver homônimos em UFs diferentes):
await geocodeMunicipality("Bonito");          // vários
await geocodeMunicipality("São Paulo", "SP"); // filtra por UF

// Centroides:
await municipalityCentroid("3550308"); // { id, name, uf, latitude, longitude }
await stateCentroid("SP");             // { latitude, longitude }
```

!!! tip "`reverseGeocode` vs `nearestMunicipality`"
    - **`reverseGeocode`** faz **point-in-polygon** → devolve o município que realmente contém o ponto. Carrega a geometria de **um** estado (chunk lazy por UF). Passe `{ uf }` se já souber, pra pular a detecção do estado candidato.
    - **`nearestMunicipality`** compara só **centroides** → rápido e sem carregar geometria, mas perto de bordas/em municípios grandes pode cair num vizinho.

### Receita: "onde estou?" (GPS → município)

Combine com o `usePositionTracker` do módulo [Geolocalização](./geo.md):

```tsx
import { useEffect, useState } from "react";
import { usePositionTracker } from "tempest-react-sdk";
import { reverseGeocode, type ReverseGeocodeResult } from "tempest-react-sdk/br";

export function OndeEstou() {
  const { lastPoint, start } = usePositionTracker({ autoStart: true });
  const [local, setLocal] = useState<ReverseGeocodeResult | null>(null);

  useEffect(() => {
    if (lastPoint) reverseGeocode(lastPoint).then(setLocal);
  }, [lastPoint]);

  return <p>{local ? `Você está em ${local.name} — ${local.uf}` : "Localizando…"}</p>;
}
```

!!! warning "Precisão"
    A geometria é simplificada (~2 km). Pontos a ~1-2 km de uma divisa podem resolver pro município vizinho; pontos no mar/fora do território devolvem o vizinho mais próximo por centroide.

---

## Parte 6 — Marcadores, escalas de cor e legenda

### Marcadores (pins)

`BrazilMap`, `BrazilStateMap` e o `TrajectoryMap` (módulo [Geolocalização](./geo.md)) aceitam `markers` — pontos `{ latitude, longitude }` plotados sobre o mapa, com `label` (tooltip), `color`, `radius` e `id`. `onMarkerClick(marker, index)` no clique.

```tsx
import { BrazilMap, type GeoMarker } from "tempest-react-sdk/br";

const capitais: GeoMarker[] = [
  { id: "sp", latitude: -23.55, longitude: -46.63, label: "São Paulo", color: "#e11d48" },
  { id: "rj", latitude: -22.91, longitude: -43.17, label: "Rio de Janeiro" },
];

<BrazilMap markers={capitais} onMarkerClick={(m) => console.log(m.label)} />;
```

!!! tip "Pins a partir do geocode"
    Combine com o geocode (Parte 5): `municipalityCentroid(id)` ou `geocodeMunicipality(name)` dão as coordenadas pra virar `markers`.

### Escalas de cor + legenda

Pra choropleth além do gradiente de 2 cores, passe `colorScale` (de `sequentialScale`/`quantizeScale`/`thresholdScale`) e emparelhe com `<MapLegend>`. Paletas prontas (colorblind-safe): `SEQUENTIAL_BLUES`, `SEQUENTIAL_GREENS`, `SEQUENTIAL_VIRIDIS`, `DIVERGING_RDBU`.

```tsx
import {
  BrazilMap,
  MapLegend,
  sequentialScale,
  SEQUENTIAL_VIRIDIS,
} from "tempest-react-sdk/br";

const vendas = { SP: 1200, MG: 640, RJ: 580, BA: 410, RS: 390 };
const scale = sequentialScale(0, 1200, SEQUENTIAL_VIRIDIS);

<div>
  <BrazilMap values={vendas} colorScale={scale} showLabels={false} />
  <MapLegend title="Vendas (R$ mil)" min={0} max={1200} palette={SEQUENTIAL_VIRIDIS} />
</div>;
```

- **`sequentialScale(min, max, palette)`** — gradiente contínuo.
- **`quantizeScale(min, max, palette)`** — `palette.length` faixas iguais.
- **`thresholdScale(thresholds, palette)`** — faixas por corte (`palette` tem `thresholds.length + 1` cores).
- **`<MapLegend>`** — gradiente contínuo (`min`/`max`/`palette` + `format`) **ou** faixas discretas (`items={[{ color, label }]}`).

!!! note "Paleta da marca"
    As paletas são padrões públicos (ColorBrewer/Viridis). Troque por qualquer lista ordenada de hex da sua marca — os builders de escala aceitam qualquer `string[]`.

---

## Sobre a geometria

- Fonte: fronteiras das UFs do **IBGE** (domínio público), simplificadas com Douglas-Peucker (~2 km de tolerância) e arredondadas a 3 casas decimais.
- Tamanho: **~119 KB cru / ~36 KB gzip**, num chunk à parte carregado **lazy** pelo `BrazilMap`.
- Precisão: adequada pra um **mapa de visão geral clicável**, **não** pra análise geográfica precisa nem cálculo de área.

!!! info "Município: use o `BrazilStateMap`"
    O `BrazilMap` desenha **estados**. Para o nível de **município**, o [`BrazilStateMap`](#parte-4-submapa-de-estado-brazilstatemap) desenha todos os municípios de um estado — a geometria municipal (~2 MB no total) é dividida por UF e carregada **lazy**, um chunk por estado, então nunca cai tudo num bundle só.

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
- **Mapa nacional**: `BrazilMap` renderiza as 27 UFs em SVG — clicável (`onSelect`), destacável (`selected`) e choropleth (`values`). Zero tile externo; geometria empacotada e lazy.
- **Submapa de estado**: `BrazilStateMap` desenha todos os municípios de uma UF — clicável, choropleth, geometria por estado carregada lazy. `loadStateMunicipalities(uf)` expõe a geometria crua.
- **Import** sempre pelo subpath `tempest-react-sdk/br`.

## Veja também

- [Geolocalização](./geo.md) — coleta de lat/lon, trajetória e `TrajectoryMap` (tile-free)
- [Forms BR](./forms-br.md) — CPF/CNPJ/CEP e `useViaCEP`
- [Componentes: Entrada de dados](./components/inputs.md) — `Select`, `Combobox`
