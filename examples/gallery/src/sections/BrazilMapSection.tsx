import { useState, type ReactElement } from "react";
import { Badge } from "tempest-react-sdk";
import {
    BrazilMap,
    BrazilStateCitySelect,
    citiesByUf,
    getState,
    type UF,
} from "tempest-react-sdk/br";
import { Example } from "../Example";

/** Clickable BR map → selected state + its city dropdown. */
function ClickableMapDemo(): ReactElement {
    const [uf, setUf] = useState<UF | null>(null);
    const state = uf ? getState(uf) : null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                    Clique num estado:
                </span>
                {state ? (
                    <Badge variant="success">
                        {state.name} ({state.uf}) · {citiesByUf(state.uf).length} cidades
                    </Badge>
                ) : (
                    <Badge variant="neutral">nenhum selecionado</Badge>
                )}
            </div>

            <BrazilMap selected={uf} onSelect={setUf} height={420} />

            {uf && (
                <div style={{ maxWidth: 420 }}>
                    <BrazilStateCitySelect
                        key={uf}
                        defaultUf={uf}
                        onChange={({ city }) => console.log("cidade", city)}
                    />
                </div>
            )}
        </div>
    );
}

/** Static choropleth: a made-up metric per state. */
const POPULATION_INDEX: Partial<Record<UF, number>> = {
    SP: 100,
    MG: 62,
    RJ: 58,
    BA: 52,
    PR: 42,
    RS: 41,
    PE: 38,
    CE: 37,
    PA: 34,
    SC: 30,
    GO: 28,
    MA: 26,
    AM: 22,
    ES: 18,
    PB: 16,
    RN: 15,
    MT: 15,
    AL: 14,
    PI: 13,
    DF: 20,
    MS: 12,
    SE: 10,
    RO: 9,
    TO: 8,
    AC: 5,
    AP: 5,
    RR: 4,
};

function ChoroplethDemo(): ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                Tinta proporcional a um índice fictício por estado (choropleth).
            </span>
            <BrazilMap values={POPULATION_INDEX} showLabels height={420} />
        </div>
    );
}

/** Standalone cascading Estado → Cidade selector. */
function SelectorDemo(): ReactElement {
    const [sel, setSel] = useState<{ uf: UF | null; city: string | null }>({
        uf: null,
        city: null,
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
            <BrazilStateCitySelect onChange={setSel} />
            <span style={{ fontSize: 13, color: "var(--tempest-text-muted, #888)" }}>
                Seleção: {sel.uf ?? "—"} / {sel.city ?? "—"}
            </span>
        </div>
    );
}

/** Recipe section for the Brazil map + locations data (subpath `/br`). */
export function BrazilMapSection(): ReactElement {
    return (
        <section className="gallery-section" id="brazil-map">
            <h3>Mapa do Brasil + dados de localidade</h3>
            <p className="description">
                Mapa nacional clicável das 27 UFs (SVG a partir de GeoJSON IBGE simplificado
                empacotado no SDK) + dataset de estados/cidades — <strong>sem API externa</strong>.
                Import via <code>tempest-react-sdk/br</code> (subpath opt-in; a geometria carrega
                lazy). Espelha o <code>utils/locations</code> do <code>tempest-fastapi-sdk</code>.
            </p>

            <Example
                id="ex-brazil-map-click"
                title="BrazilMap — mapa clicável + dropdown de cidades"
                note={
                    <>
                        Clique num estado no mapa: <code>onSelect(uf)</code> dispara e o seletor
                        abaixo lista as cidades daquele UF (do dataset empacotado). Zero request
                        externa.
                    </>
                }
                code={`import { useState } from "react";
import { BrazilMap, BrazilStateCitySelect, type UF } from "tempest-react-sdk/br";

function MapaNacional() {
  const [uf, setUf] = useState<UF | null>(null);
  return (
    <>
      <BrazilMap selected={uf} onSelect={setUf} height={420} />
      {uf && <BrazilStateCitySelect defaultUf={uf} onChange={(s) => console.log(s)} />}
    </>
  );
}`}
                props={[
                    {
                        name: "selected",
                        type: "UF | UF[] | null",
                        description: "UF(s) destacada(s).",
                    },
                    {
                        name: "onSelect",
                        type: "(uf: UF) => void",
                        description: "Clique num estado.",
                    },
                    {
                        name: "values",
                        type: "Partial<Record<UF, number>>",
                        description: "Métrica por estado → choropleth.",
                    },
                    {
                        name: "height",
                        type: "number",
                        default: "440",
                        description: "Altura em px.",
                    },
                    {
                        name: "showLabels",
                        type: "boolean",
                        default: "true",
                        description: "Sigla no centroide de cada UF.",
                    },
                ]}
            >
                <ClickableMapDemo />
            </Example>

            <Example
                id="ex-brazil-choropleth"
                title="BrazilMap — choropleth por métrica"
                note={
                    <>
                        Passe <code>values</code> (número por UF) e cada estado é tingido
                        linearmente.
                    </>
                }
                code={`import { BrazilMap } from "tempest-react-sdk/br";

<BrazilMap
  values={{ SP: 100, MG: 62, RJ: 58, BA: 52, /* ... */ }}
  minColor="#dbeafe"
  maxColor="#2563eb"
/>;`}
            >
                <ChoroplethDemo />
            </Example>

            <Example
                id="ex-brazil-selector"
                title="BrazilStateCitySelect — cascata Estado → Cidade"
                note={
                    <>
                        Dropdowns encadeados alimentados por <code>citiesByUf(uf)</code>.
                    </>
                }
                code={`import { BrazilStateCitySelect, citiesByUf, ufChoices } from "tempest-react-sdk/br";

ufChoices();        // [{ value: "AC", label: "Acre" }, ...] (27)
citiesByUf("SP");   // ["Adamantina", "Adolfo", ...]

<BrazilStateCitySelect onChange={({ uf, city }) => console.log(uf, city)} />`}
            >
                <SelectorDemo />
            </Example>
        </section>
    );
}
