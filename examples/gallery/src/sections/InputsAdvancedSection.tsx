import { useState } from "react";
import {
    Combobox,
    DateRangePicker,
    type DateRange,
    Input,
    Label,
    MultiSelect,
    RangeSlider,
    RatingStars,
    Slider,
    Toggle,
    ToggleGroup,
    ToggleGroupItem,
} from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Controles de entrada avançados: alternadores, avaliação por estrelas, faixa
 * dupla, combobox filtrável e rótulo de formulário.
 */
export function InputsAdvancedSection() {
    const [bold, setBold] = useState(false);
    const [italic, setItalic] = useState(true);
    const [view, setView] = useState<string | string[]>("grid");
    const [rating, setRating] = useState(3);
    const [price, setPrice] = useState<[number, number]>([20, 80]);
    const [volume, setVolume] = useState(60);
    const [fruit, setFruit] = useState("");
    const [states, setStates] = useState<string[]>(["sp"]);
    const [range, setRange] = useState<DateRange>({ start: null, end: null });

    return (
        <section className="gallery-section" id="inputs-advanced">
            <h3>Toggle · Rating · Range · Combobox · Calendar · Label</h3>
            <p className="description">
                Controles ricos de entrada, todos totalmente acessíveis e tematizáveis.
            </p>

            <Example
                title="Toggle"
                note="Botão de dois estados (pressionado / solto)."
                code={`const [bold, setBold] = useState(false);
const [italic, setItalic] = useState(true);

<Toggle pressed={bold} onPressedChange={setBold}>Negrito</Toggle>
<Toggle pressed={italic} onPressedChange={setItalic} variant="outline">Itálico</Toggle>`}
            >
                <Toggle pressed={bold} onPressedChange={setBold}>
                    Negrito
                </Toggle>
                <Toggle pressed={italic} onPressedChange={setItalic} variant="outline">
                    Itálico
                </Toggle>
            </Example>

            <Example
                title="ToggleGroup"
                note="Seleção única — alternar entre grade e lista."
                code={`const [view, setView] = useState<string | string[]>("grid");

<ToggleGroup type="single" value={view} onValueChange={setView}>
  <ToggleGroupItem value="grid">Grade</ToggleGroupItem>
  <ToggleGroupItem value="list">Lista</ToggleGroupItem>
</ToggleGroup>`}
            >
                <ToggleGroup type="single" value={view} onValueChange={setView}>
                    <ToggleGroupItem value="grid">Grade</ToggleGroupItem>
                    <ToggleGroupItem value="list">Lista</ToggleGroupItem>
                </ToggleGroup>
            </Example>

            <Example
                title="RatingStars"
                note="Interativo (clique para avaliar) e somente leitura."
                code={`const [rating, setRating] = useState(3);

<RatingStars value={rating} onChange={setRating} />
<RatingStars value={4} readonly />`}
            >
                <RatingStars value={rating} onChange={setRating} />
                <RatingStars value={4} readonly />
            </Example>

            <Example
                title="RangeSlider"
                note="Faixa de dois polegares — ótimo para filtros de preço."
                code={`const [price, setPrice] = useState<[number, number]>([20, 80]);

<RangeSlider value={price} onChange={setPrice} label="Preço" />
<p>R$ {price[0]} – R$ {price[1]}</p>`}
            >
                <RangeSlider value={price} onChange={setPrice} label="Preço" />
                <p>
                    R$ {price[0]} – R$ {price[1]}
                </p>
            </Example>

            <Example
                title="Slider"
                note="Faixa de um polegar (valor único)."
                code={`const [volume, setVolume] = useState(60);

<Slider value={volume} onChange={setVolume} label="Volume" formatValue={(v) => v + "%"} />`}
            >
                <Slider
                    value={volume}
                    onChange={setVolume}
                    label="Volume"
                    formatValue={(v) => `${v}%`}
                />
            </Example>

            <Example
                title="Combobox"
                note="Input com lista filtrável — digite para buscar."
                code={`const [fruit, setFruit] = useState("");

<Combobox
  label="Fruta"
  value={fruit}
  onChange={setFruit}
  options={[
    { value: "apple", label: "Maçã" },
    { value: "banana", label: "Banana" },
    { value: "grape", label: "Uva" },
    { value: "mango", label: "Manga" },
    { value: "orange", label: "Laranja" },
  ]}
/>`}
            >
                <Combobox
                    label="Fruta"
                    value={fruit}
                    onChange={setFruit}
                    options={[
                        { value: "apple", label: "Maçã" },
                        { value: "banana", label: "Banana" },
                        { value: "grape", label: "Uva" },
                        { value: "mango", label: "Manga" },
                        { value: "orange", label: "Laranja" },
                    ]}
                />
            </Example>

            <Example
                title="MultiSelect"
                note="Multi-seleção com chips remováveis + busca."
                code={`const [states, setStates] = useState<string[]>(["sp"]);

<MultiSelect
  label="Estados"
  value={states}
  onChange={setStates}
  options={[
    { value: "sp", label: "São Paulo" },
    { value: "rj", label: "Rio de Janeiro" },
    { value: "mg", label: "Minas Gerais" },
    { value: "ba", label: "Bahia" },
  ]}
/>`}
            >
                <MultiSelect
                    label="Estados"
                    value={states}
                    onChange={setStates}
                    options={[
                        { value: "sp", label: "São Paulo" },
                        { value: "rj", label: "Rio de Janeiro" },
                        { value: "mg", label: "Minas Gerais" },
                        { value: "ba", label: "Bahia" },
                    ]}
                />
            </Example>

            <Example
                title="DateRangePicker"
                note="Selecione início e fim; dias entre eles são destacados."
                code={`const [range, setRange] = useState<DateRange>({ start: null, end: null });

<DateRangePicker value={range} onChange={setRange} numberOfMonths={2} />`}
            >
                <DateRangePicker value={range} onChange={setRange} numberOfMonths={2} />
            </Example>

            <Example
                title="Label"
                note="Rótulo associado a um campo via htmlFor; required marca com asterisco."
                code={`<Label htmlFor="email" required>Email</Label>
<Input id="email" type="email" placeholder="voce@exemplo.com" />`}
            >
                <Label htmlFor="email" required>
                    Email
                </Label>
                <Input id="email" type="email" placeholder="voce@exemplo.com" />
            </Example>
        </section>
    );
}
