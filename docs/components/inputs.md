# Entrada de dados

Controles para coleta de dados do usuário. Todos forward refs para o elemento DOM nativo (compatível com `react-hook-form`).

## O que é esta categoria

Esta página reúne todo o conjunto de **controles de formulário** do SDK — desde o `Input` de texto simples até campos especializados como `PinInput` (OTP), `PasswordInput` (com medidor de força) e `RangeSlider` (faixa dupla). Todos compartilham a mesma API de rótulo/erro/tamanho (ver a seção Convenções abaixo) e fazem forward de `ref`, então plugam direto em `react-hook-form` sem wrappers extras.

**Quando usar:** sempre que precisar coletar um valor do usuário. Escolha o controle pelo tipo de dado — texto curto (`Input`), texto longo (`Textarea`), uma opção entre poucas (`Radio`/`Select`), uma opção entre muitas com busca (`Combobox`), booleano (`Switch`/`Checkbox`), código de verificação (`PinInput`), número com incremento (`StepperInput`), etc.

!!! tip "Comece pelas Convenções"
    Todos os campos aceitam `label`, `helperText`, `error`, `required` e `size` da mesma forma. Aprenda essas 5 props uma vez e você sabe usar qualquer campo desta página.

## Convenções

- `label` (string ou node) — rótulo acima do campo.
- `helperText` — texto auxiliar abaixo; substituído por `error` quando este é setado.
- `error` (string) — mensagem de erro; adiciona `aria-invalid="true"` + borda vermelha.
- `required` — adiciona `*` no label e propaga `required` no input.
- `size: "sm" | "md" | "lg"` — escala de altura/padding/font via tokens density.

## `Input`

Texto single-line.

```tsx
import { Input } from "tempest-react-sdk";
import { Search } from "lucide-react";

<Input label="Email" type="email" placeholder="user@example.com" required />;
<Input label="Buscar" leftIcon={<Search size={16} />} placeholder="palavra-chave" />;
<Input label="Senha" type="password" error="Mínimo 8 caracteres" />;
```

| Prop               | Tipo                                                   | Default |
| ------------------ | ------------------------------------------------------ | ------- |
| `label`            | `string`                                               | —       |
| `helperText`       | `string`                                               | —       |
| `error`            | `string`                                               | —       |
| `leftIcon`         | `ReactNode`                                            | —       |
| `rightIcon`        | `ReactNode`                                            | —       |
| `size`             | `"sm" \| "md" \| "lg"`                                 | `"md"`  |
| `wrapperClassName` | `string`                                               | —       |
| ...                | Todos os atributos de `HTMLInputElement` exceto `size` | —       |

## `Textarea`

Multi-linha. Mesma API do `Input` (sem `leftIcon`/`rightIcon`).

```tsx
<Textarea label="Mensagem" rows={4} helperText="Máximo 500 caracteres" />
```

## `Select`

Nativo `<select>`. Aceita `options` (lista) ou `<option>` children.

```tsx
<Select
  label="UF"
  options={[
    { value: "SP", label: "São Paulo" },
    { value: "RJ", label: "Rio de Janeiro" },
  ]}
/>
```

| Prop      | Tipo             | Default |
| --------- | ---------------- | ------- |
| `options` | `SelectOption[]` | —       |
| `label`   | `string`         | —       |
| `error`   | `string`         | —       |

## `Combobox`

**Quando usar:** uma opção entre muitas (dezenas+), onde o usuário precisa digitar para filtrar. Para poucas opções use `Select`.

Select com busca + filtro. Keyboard nav (↑↓ Enter Esc).

```tsx
<Combobox
  label="Cidade"
  options={cities}
  value={city}
  onChange={setCity}
  filter={(opt, query) => opt.label.toLowerCase().includes(query.toLowerCase())}
/>
```

## `MultiSelect`

**Quando usar:** várias opções entre muitas, com busca e chips removíveis. Para uma única opção use `Combobox`; para poucas opções booleanas use `Checkbox`.

Multi-select filtrável com chips removíveis. Keyboard nav (↑↓ navega, Enter alterna, Esc fecha, Backspace com query vazia remove o último chip).

```tsx
import { MultiSelect, type MultiSelectOption } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [sel, setSel] = useState<string[]>([]);
  const options: MultiSelectOption[] = [
    { value: "sp", label: "São Paulo" },
    { value: "rj", label: "Rio de Janeiro" },
  ];

  return <MultiSelect label="Estados" options={options} value={sel} onChange={setSel} />;
}
```

| Prop           | Tipo                                            | Default                       |
| -------------- | ----------------------------------------------- | ----------------------------- |
| `options`      | `MultiSelectOption[]`                           | — (obrigatório)               |
| `value`        | `string[]`                                       | — (obrigatório, controlled)   |
| `onChange`     | `(value: string[]) => void`                      | — (obrigatório)               |
| `label`        | `string`                                         | —                             |
| `placeholder`  | `string`                                         | `"Selecione"`                 |
| `helperText`   | `string`                                         | —                             |
| `error`        | `string`                                         | —                             |
| `disabled`     | `boolean`                                         | `false`                       |
| `maxItems`     | `number`                                          | —                             |
| `filter`       | `(option, query) => boolean`                     | —                             |
| `emptyMessage` | `string`                                          | `"Nenhuma opção encontrada"`  |
| `className`    | `string`                                         | —                             |

`MultiSelectOption` é `{ value: string; label: string; disabled?: boolean }`.

## `Checkbox`

Single checkbox. Suporta `indeterminate`.

```tsx
<Checkbox label="Aceito os termos" />;
<Checkbox label="Selecionar todos" indeterminate={someSelected && !allSelected} />;
```

## `Radio` / `RadioGroup`

Radio standalone OU agrupado com value único.

```tsx
<RadioGroup label="Plano" value={plan} onChange={setPlan}>
  <Radio value="free" label="Grátis" />
  <Radio value="pro" label="Pro" />
  <Radio value="team" label="Team" />
</RadioGroup>
```

## `Switch`

**Quando usar:** ligar/desligar uma preferência com efeito imediato (ex.: notificações). Para opt-in que só vale ao submeter o form (ex.: aceitar termos), prefira `Checkbox`.

Toggle on/off.

```tsx
<Switch
  label="Receber emails"
  checked={subscribed}
  onChange={(e) => setSubscribed(e.target.checked)}
/>
```

!!! note "Switch vs Checkbox — não são intercambiáveis"
    `Switch` comunica uma ação que acontece **agora**; `Checkbox` comunica um estado que será aplicado **depois** (no submit). Trocar um pelo outro confunde o usuário sobre quando a mudança tem efeito.

## `ChipInput`

Lista de chips com adição por Enter + dedup automático.

```tsx
<ChipInput label="Tags" value={tags} onChange={setTags} placeholder="adicione e pressione Enter" />
```

## `SearchBar`

Input de busca com clear button + debounce opcional via `useDebounce`.

```tsx
<SearchBar value={q} onChange={setQ} placeholder="O que você procura?" />
```

## `DatePicker`

`<input type="date">` (ou `time`, `datetime-local`, `month`) com label/error.

```tsx
<DatePicker label="Data" value={date} onChange={setDate} mode="date" min="2025-01-01" />;
<DatePicker label="Início" mode="datetime-local" value={start} onChange={setStart} />;
```

## `DateRangePicker`

**Quando usar:** seleção de um intervalo de datas (início + fim) num calendário. Para uma única data use `Calendar`.

Calendário de intervalo: o primeiro clique define `start`, o próximo define `end` (reordenado automaticamente se for anterior), um terceiro clique recomeça; o dia sob o cursor pré-visualiza o intervalo. Matemática de `Date` pura, sem dependências.

```tsx
import { DateRangePicker, type DateRange } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [range, setRange] = useState<DateRange>({ start: null, end: null });

  return <DateRangePicker value={range} onChange={setRange} numberOfMonths={2} />;
}
```

| Prop             | Tipo                              | Default                     |
| ---------------- | --------------------------------- | --------------------------- |
| `value`          | `DateRange`                       | — (obrigatório, controlled) |
| `onChange`       | `(range: DateRange) => void`      | — (obrigatório)             |
| `numberOfMonths` | `number`                          | `2`                         |
| `defaultMonth`   | `Date`                            | —                           |
| `minDate`        | `Date`                            | —                           |
| `maxDate`        | `Date`                            | —                           |
| `weekStartsOn`   | `0 \| 1`                          | `0`                         |
| `className`      | `string`                          | —                           |

`DateRange` é `{ start: Date | null; end: Date | null }`.

## `FileUpload`

Drag-and-drop + click-to-upload + lista de arquivos.

```tsx
<FileUpload
  label="Anexar"
  accept="image/*"
  multiple
  onFilesChange={(files) => setFiles(files)}
  maxSize={5 * 1024 * 1024}
/>
```

## `Slider`

**Quando usar:** escolher um único valor numa faixa contínua (volume, brilho, etc.). Para uma faixa de dois valores use `RangeSlider`.

Slider de thumb único sobre `<input type="range">` nativo.

```tsx
import { Slider } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [vol, setVol] = useState(30);

  return <Slider value={vol} onChange={setVol} label="Volume" formatValue={(v) => v + "%"} />;
}
```

| Prop          | Tipo                          | Default                     |
| ------------- | ----------------------------- | --------------------------- |
| `value`       | `number`                      | — (obrigatório, controlled) |
| `onChange`    | `(value: number) => void`     | — (obrigatório)             |
| `min`         | `number`                      | `0`                         |
| `max`         | `number`                      | `100`                       |
| `step`        | `number`                      | `1`                         |
| `label`       | `string`                      | —                           |
| `helperText`  | `string`                      | —                           |
| `disabled`    | `boolean`                     | `false`                     |
| `formatValue` | `(value: number) => string`   | —                           |
| `className`   | `string`                      | —                           |

## `RangeSlider`

Dual-thumb slider com clamp `low ≤ high`.

```tsx
<RangeSlider
  label="Faixa de preço"
  min={0}
  max={1000}
  step={10}
  value={range}
  onChange={setRange}
  format={(n) => `R$ ${n}`}
/>
```

## `RatingStars`

Radio group de estrelas.

```tsx
<RatingStars value={rating} onChange={setRating} max={5} size="md" />;
<RatingStars value={4.5} readonly size="lg" />;
```

## `PinInput`

**Quando usar:** códigos de verificação curtos (OTP, 2FA, confirmação por SMS/email). Para senhas use `PasswordInput`.

OTP / one-time-code com N células. Paste, auto-advance, backspace flowback, arrow nav.

!!! tip "Colar o código inteiro funciona"
    O usuário pode colar `123456` em qualquer célula que o `PinInput` distribui os dígitos automaticamente — defina `type="numeric"` para que o teclado mobile abra no modo numérico.

```tsx
<PinInput length={6} type="numeric" onComplete={(otp) => verify(otp)} />;
<PinInput length={4} type="alphanumeric" masked autoFocus />;
```

| Prop           | Tipo                          | Default        |
| -------------- | ----------------------------- | -------------- |
| `length`       | `number`                      | `6`            |
| `type`         | `"numeric" \| "alphanumeric"` | `"numeric"`    |
| `value`        | `string`                      | — (controlled) |
| `defaultValue` | `string`                      | `""`           |
| `onChange`     | `(value: string) => void`     | —              |
| `onComplete`   | `(value: string) => void`     | —              |
| `masked`       | `boolean`                     | `false`        |
| `size`         | `"sm" \| "md" \| "lg"`        | `"md"`         |
| `autoFocus`    | `boolean`                     | `false`        |

## `PasswordInput`

Field tipo `password` com toggle de visibilidade + strength meter opcional (5 níveis).

```tsx
<PasswordInput label="Senha" autoComplete="new-password" showStrength />
```

Helper exposto: `estimatePasswordStrength(value)` retorna `0-4` (length, case mix, digits, symbols).

!!! warning "Use `autoComplete` correto"
    Em telas de cadastro use `autoComplete="new-password"`; em login use `autoComplete="current-password"`. O valor errado faz o gerenciador de senhas do navegador sugerir/salvar a senha de forma incorreta.

| Prop             | Tipo                                      | Default                                                  |
| ---------------- | ----------------------------------------- | -------------------------------------------------------- |
| `showStrength`   | `boolean`                                 | `false`                                                  |
| `strength`       | `0 \| 1 \| 2 \| 3 \| 4` (override manual) | `estimatePasswordStrength(value)`                        |
| `strengthLabels` | `[string,string,string,string,string]`    | `["Muito fraca","Fraca","Razoável","Forte","Excelente"]` |
| `toggleLabels`   | `{ show, hide }`                          | `{ show: "Mostrar senha", hide: "Esconder senha" }`      |

## `StepperInput`

`+ / −` numeric com clamp em `min/max`.

```tsx
<StepperInput value={qty} onChange={setQty} min={1} max={10} />;
<StepperInput value={price} onChange={setPrice} step={5} format={(n) => `R$ ${n}`} />;
```

## `Form` / `FormSection` / `FormRow` / `FormActions` / `FormField`

Layout wrappers para forms (`stack`/`inline`/`grid`) + integração RHF.

```tsx
<Form layout="grid" columns={2} gap={4}>
  <Input label="Nome" />
  <Input label="Email" type="email" />
  <FormActions style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Salvar</Button>
  </FormActions>
</Form>
```

Detalhes completos em [../forms.md](../forms.md).

## A11y

- Sempre use `label` — screen readers anunciam o campo.
- `error` adiciona `aria-invalid="true"` + descreve via `aria-describedby`.
- `required` propaga atributo `required` nativo + indicador visual `*`.
- `PinInput` cells expõem `aria-label="Dígito N"` individuais.
- `PasswordInput.toggle` usa `aria-pressed` e label `aria-label` localizada.

## Resumo

- Escolha o controle pelo **tipo de dado** — não force um `Input` onde um `Select`, `Switch` ou `PinInput` comunica melhor a intenção.
- Todos os campos compartilham `label` / `helperText` / `error` / `required` / `size` e fazem forward de `ref` → plugam direto em `react-hook-form`.
- `error` substitui `helperText` e adiciona `aria-invalid` automaticamente — não duplique a mensagem.

Páginas relacionadas:

- [Validação de formulários](../forms.md) — `validateForm`, `useZodForm`, máscaras BR, `useViaCEP` e o wrapper `<FormField>`.
- [Layout](./layout.md) — `Form`/`FormSection`/`FormRow`/`FormActions` para estruturar os campos.
- [Ações](./actions.md) — `Button` para o submit do formulário.
- [Status & feedback](./feedback.md) — `Alert`/`Toast` para confirmar sucesso ou erro do envio.
