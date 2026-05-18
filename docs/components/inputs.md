# Entrada de dados

Controles para coleta de dados do usuário. Todos forward refs para o elemento DOM nativo (compatível com `react-hook-form`).

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

Toggle on/off.

```tsx
<Switch
  label="Receber emails"
  checked={subscribed}
  onChange={(e) => setSubscribed(e.target.checked)}
/>
```

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

OTP / one-time-code com N células. Paste, auto-advance, backspace flowback, arrow nav.

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
