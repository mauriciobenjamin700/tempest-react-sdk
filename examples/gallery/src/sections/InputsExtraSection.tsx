import { useState } from "react";
import {
    Calendar,
    DatePicker,
    DateRangePicker,
    Dropzone,
    ErrorText,
    Kbd,
    Label,
    MultiSelect,
    PasswordInput,
    PinInput,
    Slider,
    StepperInput,
    estimatePasswordStrength,
    type DateRange,
    type MultiSelectOption,
} from "tempest-react-sdk";
import { Command } from "lucide-react";
import { Example } from "../Example";

const MULTISELECT_OPTIONS: MultiSelectOption[] = [
    { value: "react", label: "React" },
    { value: "vue", label: "Vue" },
    { value: "svelte", label: "Svelte" },
    { value: "angular", label: "Angular" },
    { value: "solid", label: "Solid" },
];

/**
 * Gallery section showcasing the advanced data-entry components: date pickers,
 * calendar, password / pin inputs, slider, multi-select, stepper, the small
 * field primitives (Label / ErrorText / Kbd) and the file Dropzone. Every demo
 * is fully controlled via local state so the inputs update live.
 */
export function InputsExtraSection() {
    const [date, setDate] = useState<string>("");
    const [range, setRange] = useState<DateRange>({ start: null, end: null });
    const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);
    const [password, setPassword] = useState<string>("");
    const [pin, setPin] = useState<string>("");
    const [volume, setVolume] = useState<number>(40);
    const [frameworks, setFrameworks] = useState<string[]>(["react"]);
    const [quantity, setQuantity] = useState<number>(1);
    const [coupon, setCoupon] = useState<string>("");
    const [files, setFiles] = useState<string[]>([]);

    const couponError =
        coupon && coupon.length < 4 ? "O cupom deve ter ao menos 4 caracteres." : undefined;

    const formatRange = (value: DateRange): string => {
        const fmt = (d: Date | null): string => (d ? d.toLocaleDateString("pt-BR") : "—");
        return `${fmt(value.start)} → ${fmt(value.end)}`;
    };

    return (
        <section className="gallery-section" id="inputs-extra">
            <h3>Entrada de dados (avançado)</h3>
            <p className="description">
                Componentes de entrada além dos campos básicos: seletores de data, calendário, senha
                com medidor de força, código OTP, slider, múltipla escolha, stepper numérico,
                primitivos de formulário e área de upload por arrastar-e-soltar. Todos controlados
                via <code>useState</code>.
            </p>

            <Example
                title="DatePicker"
                id="ex-date-picker"
                note='Wrapper fino sobre <input type=\"date\">. Valor é uma string ISO (YYYY-MM-DD).'
                code={`const [date, setDate] = useState("");

<DatePicker
    label="Data de nascimento"
    value={date}
    onChange={setDate}
    max="2010-12-31"
    helperText="Selecione uma data até 2010."
/>`}
                props={[
                    {
                        name: "value",
                        type: "string",
                        description: "Data ISO (YYYY-MM-DD) ou vazio.",
                    },
                    {
                        name: "onChange",
                        type: "(value: string) => void",
                        description: "Recebe a nova string de data.",
                    },
                    { name: "label", type: "string", description: "Rótulo acima do campo." },
                    {
                        name: "mode",
                        type: '"date" | "datetime-local" | "time" | "month"',
                        default: '"date"',
                        description: "Tipo do input nativo.",
                    },
                    { name: "min", type: "string", description: "Limite inferior (YYYY-MM-DD)." },
                    { name: "max", type: "string", description: "Limite superior (YYYY-MM-DD)." },
                    { name: "error", type: "string", description: "Mensagem de erro." },
                ]}
            >
                <div className="gallery-stack">
                    <DatePicker
                        label="Data de nascimento"
                        value={date}
                        onChange={setDate}
                        max="2010-12-31"
                        helperText="Selecione uma data até 2010."
                    />
                </div>
            </Example>

            <Example
                title="DateRangePicker"
                id="ex-date-range-picker"
                note="Escolhe início e fim. value é um DateRange { start, end } de objetos Date."
                code={`const [range, setRange] = useState<DateRange>({ start: null, end: null });

<DateRangePicker
    value={range}
    onChange={setRange}
    numberOfMonths={1}
    weekStartsOn={1}
/>`}
                props={[
                    {
                        name: "value",
                        type: "DateRange",
                        description: "Intervalo selecionado { start, end } (Date | null).",
                    },
                    {
                        name: "onChange",
                        type: "(range: DateRange) => void",
                        description: "Recebe o novo intervalo.",
                    },
                    {
                        name: "numberOfMonths",
                        type: "number",
                        default: "2",
                        description: "Quantos grids de mês exibir lado a lado.",
                    },
                    { name: "minDate", type: "Date", description: "Data mínima selecionável." },
                    { name: "maxDate", type: "Date", description: "Data máxima selecionável." },
                    {
                        name: "weekStartsOn",
                        type: "0 | 1",
                        default: "0",
                        description: "Primeiro dia da semana (0 domingo, 1 segunda).",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <DateRangePicker
                        value={range}
                        onChange={setRange}
                        numberOfMonths={1}
                        weekStartsOn={1}
                    />
                    <p className="description">Selecionado: {formatRange(range)}</p>
                </div>
            </Example>

            <Example
                title="Calendar"
                id="ex-calendar"
                note="Seletor de uma única data em grade mensal. Navegação por teclado nas setas."
                code={`const [date, setDate] = useState<Date | undefined>(undefined);

<Calendar
    value={date}
    onChange={setDate}
    weekStartsOn={1}
/>`}
                props={[
                    { name: "value", type: "Date", description: "Data selecionada (controlado)." },
                    {
                        name: "onChange",
                        type: "(date: Date) => void",
                        description: "Recebe a data selecionada.",
                    },
                    { name: "month", type: "Date", description: "Mês visível (controlado)." },
                    {
                        name: "onMonthChange",
                        type: "(month: Date) => void",
                        description: "Disparado ao mudar de mês.",
                    },
                    { name: "minDate", type: "Date", description: "Data mínima selecionável." },
                    { name: "maxDate", type: "Date", description: "Data máxima selecionável." },
                    {
                        name: "weekStartsOn",
                        type: "0 | 1",
                        default: "0",
                        description: "Primeiro dia da semana.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <Calendar value={calendarDate} onChange={setCalendarDate} weekStartsOn={1} />
                    <p className="description">
                        Selecionado: {calendarDate ? calendarDate.toLocaleDateString("pt-BR") : "—"}
                    </p>
                </div>
            </Example>

            <Example
                title="PasswordInput"
                id="ex-password-input"
                note="Botão de mostrar/esconder e medidor de força automático (estimatePasswordStrength)."
                code={`const [password, setPassword] = useState("");

<PasswordInput
    label="Senha"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    showStrength
    autoComplete="new-password"
    helperText="Use letras, números e símbolos."
/>`}
                props={[
                    { name: "value", type: "string", description: "Valor controlado do campo." },
                    {
                        name: "showStrength",
                        type: "boolean",
                        default: "false",
                        description: "Exibe o medidor de força abaixo do campo.",
                    },
                    {
                        name: "strength",
                        type: "0 | 1 | 2 | 3 | 4",
                        description: "Sobrescreve o cálculo automático de força.",
                    },
                    { name: "label", type: "ReactNode", description: "Rótulo acima do campo." },
                    { name: "helperText", type: "ReactNode", description: "Texto auxiliar." },
                    { name: "error", type: "string", description: "Mensagem de erro." },
                    {
                        name: "size",
                        type: '"sm" | "md" | "lg"',
                        default: '"md"',
                        description: "Tamanho visual.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <PasswordInput
                        label="Senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        showStrength
                        autoComplete="new-password"
                        helperText="Use letras, números e símbolos."
                    />
                    <p className="description">
                        Força calculada: {estimatePasswordStrength(password)} / 4
                    </p>
                </div>
            </Example>

            <Example
                title="PinInput"
                id="ex-pin-input"
                note="Código OTP em N células, com auto-avanço, colar e navegação por setas."
                code={`const [pin, setPin] = useState("");

<PinInput
    label="Código de verificação"
    length={6}
    type="numeric"
    value={pin}
    onChange={setPin}
    onComplete={(code) => console.log("completo", code)}
/>`}
                props={[
                    {
                        name: "length",
                        type: "number",
                        default: "6",
                        description: "Número de células.",
                    },
                    {
                        name: "type",
                        type: '"numeric" | "alphanumeric"',
                        default: '"numeric"',
                        description: "Conjunto de caracteres permitido.",
                    },
                    { name: "value", type: "string", description: "Valor controlado." },
                    {
                        name: "onChange",
                        type: "(value: string) => void",
                        description: "Disparado a cada mudança.",
                    },
                    {
                        name: "onComplete",
                        type: "(value: string) => void",
                        description: "Disparado quando a última célula é preenchida.",
                    },
                    {
                        name: "masked",
                        type: "boolean",
                        default: "false",
                        description: "Oculta os caracteres.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <PinInput
                        label="Código de verificação"
                        length={6}
                        type="numeric"
                        value={pin}
                        onChange={setPin}
                    />
                    <p className="description">Valor atual: {pin || "—"}</p>
                </div>
            </Example>

            <Example
                title="Slider"
                id="ex-slider"
                note='Slider de um único valor sobre <input type=\"range\">. Para dois thumbs use RangeSlider.'
                code={`const [volume, setVolume] = useState(40);

<Slider
    label="Volume"
    value={volume}
    onChange={setVolume}
    min={0}
    max={100}
    step={5}
    formatValue={(v) => \`\${v}%\`}
/>`}
                props={[
                    { name: "value", type: "number", description: "Valor atual." },
                    {
                        name: "onChange",
                        type: "(value: number) => void",
                        description: "Recebe o novo valor.",
                    },
                    { name: "min", type: "number", default: "0", description: "Valor mínimo." },
                    { name: "max", type: "number", default: "100", description: "Valor máximo." },
                    { name: "step", type: "number", default: "1", description: "Incremento." },
                    { name: "label", type: "string", description: "Rótulo do controle." },
                    {
                        name: "formatValue",
                        type: "(value: number) => string",
                        description: "Formata o badge do valor.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <Slider
                        label="Volume"
                        value={volume}
                        onChange={setVolume}
                        min={0}
                        max={100}
                        step={5}
                        formatValue={(v) => `${v}%`}
                    />
                </div>
            </Example>

            <Example
                title="MultiSelect"
                id="ex-multi-select"
                note="Dropdown filtrável com chips removíveis. value é um array de strings."
                code={`const [frameworks, setFrameworks] = useState<string[]>(["react"]);

<MultiSelect
    label="Frameworks"
    options={[
        { value: "react", label: "React" },
        { value: "vue", label: "Vue" },
        { value: "svelte", label: "Svelte" },
    ]}
    value={frameworks}
    onChange={setFrameworks}
    maxItems={3}
/>`}
                props={[
                    {
                        name: "options",
                        type: "MultiSelectOption[]",
                        description: "Opções { value, label, disabled? }.",
                    },
                    {
                        name: "value",
                        type: "string[]",
                        description: "Valores selecionados.",
                    },
                    {
                        name: "onChange",
                        type: "(value: string[]) => void",
                        description: "Recebe o novo array de valores.",
                    },
                    { name: "label", type: "string", description: "Rótulo do campo." },
                    {
                        name: "maxItems",
                        type: "number",
                        description: "Limita o número de itens selecionáveis.",
                    },
                    {
                        name: "emptyMessage",
                        type: "string",
                        default: '"Nenhuma opção encontrada"',
                        description: "Mensagem quando nada corresponde.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <MultiSelect
                        label="Frameworks"
                        options={MULTISELECT_OPTIONS}
                        value={frameworks}
                        onChange={setFrameworks}
                        maxItems={3}
                        helperText="Selecione até 3."
                    />
                    <p className="description">Selecionados: {frameworks.join(", ") || "—"}</p>
                </div>
            </Example>

            <Example
                title="StepperInput"
                id="ex-stepper-input"
                note="Stepper numérico +/− com clamp em [min, max]. Comum em quantidades de checkout."
                code={`const [quantity, setQuantity] = useState(1);

<StepperInput
    label="Quantidade"
    value={quantity}
    onChange={setQuantity}
    min={1}
    max={10}
    step={1}
/>`}
                props={[
                    { name: "value", type: "number", description: "Valor atual." },
                    {
                        name: "onChange",
                        type: "(value: number) => void",
                        description: "Recebe o novo valor já limitado.",
                    },
                    { name: "min", type: "number", default: "0", description: "Limite inferior." },
                    {
                        name: "max",
                        type: "number",
                        default: "Infinity",
                        description: "Limite superior.",
                    },
                    {
                        name: "step",
                        type: "number",
                        default: "1",
                        description: "Incremento por clique.",
                    },
                    {
                        name: "size",
                        type: '"sm" | "md" | "lg"',
                        default: '"md"',
                        description: "Tamanho visual.",
                    },
                    {
                        name: "format",
                        type: "(value: number) => string",
                        description: "Formata o valor exibido.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <StepperInput
                        label="Quantidade"
                        value={quantity}
                        onChange={setQuantity}
                        min={1}
                        max={10}
                        step={1}
                    />
                    <p className="description">Quantidade: {quantity}</p>
                </div>
            </Example>

            <Example
                title="Label, ErrorText e Kbd"
                id="ex-field-primitives"
                note="Primitivos pequenos: Label envolve um campo, ErrorText mostra a mensagem, Kbd renderiza atalhos."
                code={`const [coupon, setCoupon] = useState("");
const couponError =
    coupon && coupon.length < 4 ? "O cupom deve ter ao menos 4 caracteres." : undefined;

<>
    <Label htmlFor="coupon" required>
        Cupom
    </Label>
    <input
        id="coupon"
        value={coupon}
        onChange={(e) => setCoupon(e.target.value)}
    />
    <ErrorText>{couponError}</ErrorText>

    <p>
        Abra a paleta com <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>
    </p>
</>`}
                props={[
                    {
                        name: "Label.htmlFor",
                        type: "string",
                        description: "Associa o label a um controle pelo id.",
                    },
                    {
                        name: "Label.required",
                        type: "boolean",
                        default: "false",
                        description: "Acrescenta um asterisco de obrigatório.",
                    },
                    {
                        name: "ErrorText.children",
                        type: "ReactNode",
                        description: "Mensagem de erro; renderiza null quando vazio.",
                    },
                    {
                        name: "Kbd.size",
                        type: '"sm" | "md" | "lg"',
                        default: '"md"',
                        description: "Tamanho da tecla renderizada.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <Label htmlFor="coupon" required>
                        Cupom
                    </Label>
                    <input
                        id="coupon"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        placeholder="ABCD"
                    />
                    <ErrorText>{couponError}</ErrorText>
                    <p className="description">
                        Abra a paleta com{" "}
                        <Kbd>
                            <Command size={12} />
                        </Kbd>{" "}
                        + <Kbd>K</Kbd>
                    </p>
                </div>
            </Example>

            <Example
                title="Dropzone"
                id="ex-dropzone"
                note="Área de upload por arrastar-e-soltar. onDrop recebe File[] — aqui guardamos os nomes no estado."
                code={`const [files, setFiles] = useState<string[]>([]);

<Dropzone
    accept="image/*"
    maxSize={5 * 1024 * 1024}
    onDrop={(dropped) => setFiles(dropped.map((f) => f.name))}
>
    Solte imagens aqui ou clique para selecionar
</Dropzone>`}
                props={[
                    {
                        name: "onDrop",
                        type: "(files: File[]) => void",
                        description: "Recebe os arquivos aceitos após soltar/selecionar.",
                    },
                    {
                        name: "accept",
                        type: "string",
                        description: "Atributo accept do input de arquivo.",
                    },
                    {
                        name: "multiple",
                        type: "boolean",
                        default: "true",
                        description: "Permite múltiplos arquivos.",
                    },
                    {
                        name: "maxSize",
                        type: "number",
                        description: "Tamanho máximo em bytes; maiores são filtrados.",
                    },
                    {
                        name: "onReject",
                        type: "(files: File[]) => void",
                        description: "Recebe arquivos rejeitados por maxSize.",
                    },
                ]}
            >
                <div className="gallery-stack">
                    <Dropzone
                        accept="image/*"
                        maxSize={5 * 1024 * 1024}
                        onDrop={(dropped) => setFiles(dropped.map((f) => f.name))}
                    >
                        Solte imagens aqui ou clique para selecionar
                    </Dropzone>
                    <p className="description">
                        Arquivos: {files.length > 0 ? files.join(", ") : "nenhum"}
                    </p>
                </div>
            </Example>
        </section>
    );
}
