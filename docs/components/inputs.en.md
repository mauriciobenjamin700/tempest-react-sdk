# Data entry

Controls for collecting user data. They all forward refs to the native DOM
element (compatible with `react-hook-form`).

## What this category is

This page gathers the SDK's full set of **form controls** — from the plain
`Input` to specialized fields like `PinInput` (OTP), `PasswordInput` (with a
strength meter), `RangeSlider` (dual-thumb range) and `Dropzone` (drag-and-drop
file area). They all share the same
label/error/size API (see Conventions below) and forward their `ref`, so they
plug straight into `react-hook-form` with no extra wrappers.

**When to use:** whenever you need to collect a value from the user. Pick the
control by data type — short text (`Input`), long text (`Textarea`), one option
out of a few (`Radio`/`Select`), one option out of many with search
(`Combobox`), a boolean (`Switch`/`Checkbox`), a verification code (`PinInput`),
a number with increment (`StepperInput`), etc.

!!! tip "Start with the Conventions"
    Every field accepts `label`, `helperText`, `error`, `required` and `size`
    the same way. Learn those 5 props once and you know how to use any field on
    this page.

## Conventions

- `label` (string or node) — label above the field.
- `helperText` — auxiliary text below; replaced by `error` when it is set.
- `error` (string) — error message; adds `aria-invalid="true"` + a red border.
- `required` — adds `*` to the label and propagates `required` to the input.
- `size: "sm" | "md" | "lg"` — height/padding/font scale via density tokens.

## `Input`

<!-- gallery:form-fields -->
[![Form fields in the gallery](../assets/gallery/form-fields.webp)](../gallery.md)

*Section `form-fields` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Single-line text.

```tsx
import { Input } from "tempest-react-sdk";
import { Search } from "lucide-react";

<Input label="Email" type="email" placeholder="user@example.com" required />;
<Input label="Search" leftIcon={<Search size={16} />} placeholder="keyword" />;
<Input label="Password" type="password" error="Minimum 8 characters" />;
```

| Prop               | Type                                            | Default |
| ------------------ | ----------------------------------------------- | ------- |
| `label`            | `string`                                        | —       |
| `helperText`       | `string`                                        | —       |
| `error`            | `string`                                        | —       |
| `leftIcon`         | `ReactNode`                                     | —       |
| `rightIcon`        | `ReactNode`                                     | —       |
| `size`             | `"sm" \| "md" \| "lg"`                          | `"md"`  |
| `wrapperClassName` | `string`                                        | —       |
| ...                | All `HTMLInputElement` attributes except `size` | —       |

## `Textarea`

Multi-line. Same API as `Input` (without `leftIcon`/`rightIcon`).

```tsx
<Textarea label="Message" rows={4} helperText="Maximum 500 characters" />
```

## `Select`

Native `<select>`. Accepts `options` (a list) or `<option>` children.

```tsx
<Select
  label="State"
  options={[
    { value: "SP", label: "São Paulo" },
    { value: "RJ", label: "Rio de Janeiro" },
  ]}
/>
```

| Prop      | Type             | Default |
| --------- | ---------------- | ------- |
| `options` | `SelectOption[]` | —       |
| `label`   | `string`         | —       |
| `error`   | `string`         | —       |

## `Combobox`

<!-- gallery:inputs-advanced -->
[![Toggle · Rating · Range · Combobox in the gallery](../assets/gallery/inputs-advanced.webp)](../gallery.md)

*Section `inputs-advanced` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** one option out of many (dozens+), where the user needs to type
to filter. For a few options use `Select`.

Select with search + filter. Keyboard nav (↑↓ Enter Esc).

```tsx
<Combobox
  label="City"
  options={cities}
  value={city}
  onChange={setCity}
  filter={(opt, query) => opt.label.toLowerCase().includes(query.toLowerCase())}
/>
```

## `MultiSelect`

<!-- gallery:inputs-extra -->
[![Inputs avançados (Date · Pin · Slider) in the gallery](../assets/gallery/inputs-extra.webp)](../gallery.md)

*Section `inputs-extra` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** several options out of many, with search and removable chips.
For a single option use `Combobox`; for a few boolean options use `Checkbox`.

Filterable multi-select with removable chips. Keyboard nav (↑↓ moves, Enter
toggles, Esc closes, Backspace on an empty query removes the last chip).

```tsx
import { MultiSelect, type MultiSelectOption } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [sel, setSel] = useState<string[]>([]);
  const options: MultiSelectOption[] = [
    { value: "sp", label: "São Paulo" },
    { value: "rj", label: "Rio de Janeiro" },
  ];

  return <MultiSelect label="States" options={options} value={sel} onChange={setSel} />;
}
```

| Prop           | Type                                            | Default                       |
| -------------- | ----------------------------------------------- | ----------------------------- |
| `options`      | `MultiSelectOption[]`                           | — (required)                  |
| `value`        | `string[]`                                       | — (required, controlled)      |
| `onChange`     | `(value: string[]) => void`                      | — (required)                  |
| `label`        | `string`                                         | —                             |
| `placeholder`  | `string`                                         | `"Selecione"`                 |
| `helperText`   | `string`                                         | —                             |
| `error`        | `string`                                         | —                             |
| `disabled`     | `boolean`                                         | `false`                       |
| `maxItems`     | `number`                                          | —                             |
| `filter`       | `(option, query) => boolean`                     | —                             |
| `emptyMessage` | `string`                                          | `"Nenhuma opção encontrada"`  |
| `className`    | `string`                                         | —                             |

`MultiSelectOption` is `{ value: string; label: string; disabled?: boolean }`.

## `Checkbox`

<!-- gallery:form-primitives -->
[![Checkbox · Radio · Switch in the gallery](../assets/gallery/form-primitives.webp)](../gallery.md)

*Section `form-primitives` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

A single checkbox. Supports `indeterminate`.

```tsx
<Checkbox label="I accept the terms" />;
<Checkbox label="Select all" indeterminate={someSelected && !allSelected} />;
```

## `Radio` / `RadioGroup`

Standalone radio OR grouped with a single value.

```tsx
<RadioGroup label="Plan" value={plan} onChange={setPlan}>
  <Radio value="free" label="Free" />
  <Radio value="pro" label="Pro" />
  <Radio value="team" label="Team" />
</RadioGroup>
```

## `Switch`

**When to use:** turn a preference on/off with immediate effect (e.g.
notifications). For an opt-in that only takes effect on form submit (e.g.
accepting terms), prefer `Checkbox`.

On/off toggle.

```tsx
<Switch
  label="Receive emails"
  checked={subscribed}
  onChange={(e) => setSubscribed(e.target.checked)}
/>
```

!!! note "Switch vs Checkbox — not interchangeable"
    A `Switch` signals an action that happens **now**; a `Checkbox` signals a
    state that will be applied **later** (on submit). Swapping one for the other
    confuses the user about when the change takes effect.

## `ChipInput`

A list of chips with add-on-Enter + automatic dedup.

```tsx
<ChipInput label="Tags" value={tags} onChange={setTags} placeholder="add and press Enter" />
```

## `SearchBar`

A search input with a clear button + optional debounce via `useDebounce`.

```tsx
<SearchBar value={q} onChange={setQ} placeholder="What are you looking for?" />
```

## `DatePicker`

`<input type="date">` (or `time`, `datetime-local`, `month`) with label/error.

```tsx
<DatePicker label="Date" value={date} onChange={setDate} mode="date" min="2025-01-01" />;
<DatePicker label="Start" mode="datetime-local" value={start} onChange={setStart} />;
```

## `DateRangePicker`

**When to use:** selecting a date range (start + end) on a calendar. For a
single date use `Calendar`.

Range calendar: the first click sets `start`, the next sets `end` (auto-ordered
if it is earlier), a third click starts over; the hovered day previews the range.
Pure `Date` math, no dependencies.

```tsx
import { DateRangePicker, type DateRange } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [range, setRange] = useState<DateRange>({ start: null, end: null });

  return <DateRangePicker value={range} onChange={setRange} numberOfMonths={2} />;
}
```

| Prop             | Type                              | Default                  |
| ---------------- | --------------------------------- | ------------------------ |
| `value`          | `DateRange`                       | — (required, controlled) |
| `onChange`       | `(range: DateRange) => void`      | — (required)             |
| `numberOfMonths` | `number`                          | `2`                      |
| `defaultMonth`   | `Date`                            | —                        |
| `minDate`        | `Date`                            | —                        |
| `maxDate`        | `Date`                            | —                        |
| `weekStartsOn`   | `0 \| 1`                          | `0`                      |
| `className`      | `string`                          | —                        |

`DateRange` is `{ start: Date | null; end: Date | null }`.
## `TimePicker`

<!-- gallery:material -->
[![Material (ListTile · FAB · Rail) in the gallery](../assets/gallery/material.webp)](../gallery.md)

*Section `material` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

**When to use:** pick a time in scrollable columns (Material "spinner" style) —
scheduling, reminders, service windows. For a plain native field, use
`DatePicker` with `mode="time"`.

Always emits a 24h `"HH:MM"` string via `onChange`, even with `use12Hours`
enabled. `minuteStep` controls the granularity of the minute column.

```tsx
import { useState } from "react";
import { TimePicker } from "tempest-react-sdk";

function ScheduleField() {
  const [t, setT] = useState("09:30");

  return (
    <TimePicker
      label="Time"
      value={t}
      onChange={setT}
      minuteStep={15}
      helperText="Select hour and minute"
    />
  );
}
```

| Prop         | Type                              | Default |
| ------------ | --------------------------------- | ------- |
| `value`      | `string` (24h `"HH:MM"`)          | —       |
| `onChange`   | `(value: string) => void`         | —       |
| `minuteStep` | `number` (granularity)            | `5`     |
| `use12Hours` | `boolean` (1–12 columns + AM/PM)  | `false` |
| `label`      | `string`                          | —       |
| `helperText` | `string`                          | —       |
| `disabled`   | `boolean`                         | `false` |

!!! note "Output is always 24h"
    Even with `use12Hours` (1–12 columns + AM/PM), `onChange` keeps emitting a 24h
    `"HH:MM"` — the 12h display is visual only. Store and send the 24h value
    directly.

## `FileUpload`

<!-- gallery:advanced -->
[![Stepper · Progress · VirtualList in the gallery](../assets/gallery/advanced.webp)](../gallery.md)

*Section `advanced` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Drag-and-drop + click-to-upload + file list.

```tsx
<FileUpload
  label="Attach"
  accept="image/*"
  multiple
  onFilesChange={(files) => setFiles(files)}
  maxSize={5 * 1024 * 1024}
/>
```

## `Slider`

**When to use:** picking a single value on a continuous range (volume,
brightness, etc.). For a two-value range use `RangeSlider`.

Single-thumb slider over a native `<input type="range">`.

```tsx
import { Slider } from "tempest-react-sdk";
import { useState } from "react";

function Example() {
  const [vol, setVol] = useState(30);

  return <Slider value={vol} onChange={setVol} label="Volume" formatValue={(v) => v + "%"} />;
}
```

| Prop          | Type                          | Default                  |
| ------------- | ----------------------------- | ------------------------ |
| `value`       | `number`                      | — (required, controlled) |
| `onChange`    | `(value: number) => void`     | — (required)             |
| `min`         | `number`                      | `0`                      |
| `max`         | `number`                      | `100`                    |
| `step`        | `number`                      | `1`                      |
| `label`       | `string`                      | —                        |
| `helperText`  | `string`                      | —                        |
| `disabled`    | `boolean`                     | `false`                  |
| `formatValue` | `(value: number) => string`   | —                        |
| `aria-label`  | `string`                      | —                        |
| `className`   | `string`                      | —                        |

!!! tip "Compact slider: an accessible name without the visible label"
    Passing `label` renders a block above the track (label + value). Where that
    block does not fit — a one-line footer, a table cell, a toolbar — use
    `aria-label` on its own:

    ```tsx
    <Slider value={gain} onChange={setGain} aria-label={`${name}'s volume`} />
    ```

    Without it **every** slider on the page announces itself as `"Slider"` and a
    screen reader cannot tell them apart. Precedence is
    `aria-label` → `label` → `"Slider"`, so passing only `label` behaves exactly
    as before. Wrapping the field in an outer `<label>` does **not** help: an
    explicit `aria-label` on the input wins the accessible-name precedence order.

## `Dropzone`

**When to use:** a lean drag-and-drop area when you only need to capture the
files (`onDrop`) and render the list/preview yourself. For a ready-made field
with a label, file list and form styling, use `FileUpload`.

A drag-and-drop area with a hidden file input — clickable and keyboard
focusable. It filters by `maxSize` before calling `onDrop`; rejected files go to
`onReject`.

```tsx
import { useState } from "react";
import { Dropzone } from "tempest-react-sdk";

function Uploader() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <>
      <Dropzone
        accept="image/*"
        multiple
        maxSize={5 * 1024 * 1024}
        onDrop={(accepted) => setFiles(accepted)}
        onReject={(rejected) => alert(`${rejected.length} file(s) over 5 MB`)}
      >
        Drag images here or click to select
      </Dropzone>
      <ul>
        {files.map((file) => (
          <li key={file.name}>{file.name}</li>
        ))}
      </ul>
    </>
  );
}
```

| Prop        | Type                      | Default        |
| ----------- | ------------------------- | -------------- |
| `onDrop`    | `(files: File[]) => void` | —              |
| `accept`    | `string`                  | —              |
| `multiple`  | `boolean`                 | `true`         |
| `maxSize`   | `number` (bytes)          | —              |
| `onReject`  | `(files: File[]) => void` | —              |
| `disabled`  | `boolean`                 | `false`        |
| `children`  | `ReactNode`               | default prompt |
| `className` | `string`                  | —              |

**A11y**: `role="button"` + `tabIndex` (Enter/Space open the picker);
`aria-disabled` when `disabled`.

## `RangeSlider`

Dual-thumb slider with a `low ≤ high` clamp.

```tsx
<RangeSlider
  label="Price range"
  min={0}
  max={1000}
  step={10}
  value={range}
  onChange={setRange}
  formatValue={([lo, hi]) => `R$ ${lo} – R$ ${hi}`}
/>
```

It takes `aria-label` for the same reason `Slider` does. Each thumb keeps its own
name — `"Price range (mínimo)"` and `"Price range (máximo)"` — because someone
moving between the two needs to know which end they are on.

## `RatingStars`

A radio group of stars.

```tsx
<RatingStars value={rating} onChange={setRating} max={5} size="md" />;
<RatingStars value={4.5} readonly size="lg" />;
```

## `PinInput`

**When to use:** short verification codes (OTP, 2FA, SMS/email confirmation).
For passwords use `PasswordInput`.

OTP / one-time-code with N cells. Paste, auto-advance, backspace flowback, arrow
nav.

!!! tip "Pasting the whole code works"
    The user can paste `123456` into any cell and `PinInput` distributes the
    digits automatically — set `type="numeric"` so the mobile keyboard opens in
    numeric mode.

```tsx
<PinInput length={6} type="numeric" onComplete={(otp) => verify(otp)} />;
<PinInput length={4} type="alphanumeric" masked autoFocus />;
```

| Prop           | Type                          | Default        |
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

A `password`-type field with a visibility toggle + an optional strength meter (5
levels).

```tsx
<PasswordInput label="Password" autoComplete="new-password" showStrength />
```

Exposed helper: `estimatePasswordStrength(value)` returns `0-4` (length, case
mix, digits, symbols).

!!! warning "Use the correct `autoComplete`"
    On signup screens use `autoComplete="new-password"`; on login use
    `autoComplete="current-password"`. The wrong value makes the browser's
    password manager suggest/save the password incorrectly.

| Prop             | Type                                      | Default                                                  |
| ---------------- | ----------------------------------------- | -------------------------------------------------------- |
| `showStrength`   | `boolean`                                 | `false`                                                  |
| `strength`       | `0 \| 1 \| 2 \| 3 \| 4` (manual override) | `estimatePasswordStrength(value)`                        |
| `strengthLabels` | `[string,string,string,string,string]`    | `["Muito fraca","Fraca","Razoável","Forte","Excelente"]` |
| `toggleLabels`   | `{ show, hide }`                          | `{ show: "Mostrar senha", hide: "Esconder senha" }`      |

## `StepperInput`

`+ / −` numeric with a clamp on `min/max`.

```tsx
<StepperInput value={qty} onChange={setQty} min={1} max={10} />;
<StepperInput value={price} onChange={setPrice} step={5} format={(n) => `R$ ${n}`} />;
```

## `Form` / `FormSection` / `FormRow` / `FormActions` / `FormField`

<!-- gallery:forms -->
[![Forms (zod) in the gallery](../assets/gallery/forms.webp)](../gallery.md)

*Section `forms` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

Layout wrappers for forms (`stack`/`inline`/`grid`) + RHF integration.

```tsx
<Form layout="grid" columns={2} gap={4}>
  <Input label="Name" />
  <Input label="Email" type="email" />
  <FormActions style={{ gridColumn: "1 / -1" }}>
    <Button type="submit">Save</Button>
  </FormActions>
</Form>
```

Full details in [../forms.md](../forms.md).

## `ImageCropper`

<!-- gallery:image-cropper -->
[![ImageCropper (recorte) in the gallery](../assets/gallery/image-cropper.webp)](../gallery.md)

*Section `image-cropper` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use**: the natural partner of [`FileUpload`](#fileupload) — a profile photo, a document photo, a cover image. The app decides the output ratio; the user only chooses what lands inside it.

The frame stays **still** and the image pans and zooms behind it. That is the model an avatar flow wants: by construction there is no off-ratio crop.

```tsx
import { useRef, useState } from "react";
import { Button, FileUpload, ImageCropper, type ImageCropperHandle } from "tempest-react-sdk";

export function AvatarField({ onSave }: { onSave: (blob: Blob) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const cropper = useRef<ImageCropperHandle>(null);

  return (
    <>
      <FileUpload value={files} onChange={setFiles} accept="image/*" label="Photo" />
      {files[0] && (
        <>
          <ImageCropper
            ref={cropper}
            src={files[0]}
            aspect={1}
            shape="circle"
            maxSize={512}
            outputType="image/jpeg"
          />
          <Button
            onClick={async () => {
              const blob = await cropper.current?.crop();
              if (blob) onSave(blob);
            }}
          >
            Save
          </Button>
        </>
      )}
    </>
  );
}
```

| Prop            | Type                                            | Default             |
| --------------- | ----------------------------------------------- | ------------------- |
| `src`           | `File \| Blob \| string`                        | —                   |
| `aspect`        | `number` (`width / height`)                     | `1`                 |
| `maxZoom`       | `number`                                        | `4`                 |
| `maxSize`       | `number` (cap on the exported long edge, px)    | —                   |
| `outputType`    | `string`                                        | `"image/png"`       |
| `outputQuality` | `number` (`0`–`1`, lossy types)                 | `0.92`              |
| `shape`         | `"rect" \| "circle"`                            | `"rect"`            |
| `onCropChange`  | `({ zoom, offset }) => void`                    | —                   |
| `label`         | `string` (accessible name for the crop area)    | `"Área de recorte"` |
| `ref`           | `Ref<ImageCropperHandle>`                       | —                   |

The `ref` exposes `{ crop, reset }`. `crop()` resolves `Promise<Blob | null>`.

!!! tip "It exports the original pixels, not the preview"
    The crop is read from the image's **natural** size through a canvas. A 4000 px
    photo cropped in a 320 px preview exports at the source's resolution, not the
    preview's — the most common defect in a hand-rolled cropper.

    Use `maxSize` to cap it: a 12 MP photo cropped for a 96 px avatar is megabytes of
    waste.

!!! check "An empty edge can never happen"
    The image is always **clamped to cover the frame**, on pan and on zoom. That is the
    other classic defect: dragging or zooming out until the frame shows background, and
    the transparent (or black) band gets baked into the exported file. Here it is
    impossible by construction — including when zooming out, where an offset that was
    legal a moment ago stops being.

!!! info "Keyboard support of equal weight"
    The crop area is focusable. **Arrows** pan (with `Shift`, 4× the step), **`+`/`−`**
    zoom, **`0`** recentres. The mouse wheel zooms too. A cropper that only works by
    dragging excludes anyone navigating by keyboard.

!!! warning "`crop()` returns `null`, it does not throw"
    Before the image has loaded, or if the browser declines to encode, the result is
    `null`. A submit handler needs no `try/catch` — it needs to check the result.

!!! note "A `File`/`Blob` becomes an object URL, and it is revoked"
    Changing the photo or unmounting revokes the previous URL. Without that, every
    re-pick would leak the previous one for the lifetime of the document.

## `SignaturePad`

<!-- gallery:capture-media -->
[![SignaturePad · Lightbox · AvatarGroup in the gallery](../assets/gallery/capture-media.webp)](../gallery.md)

*Section `capture-media` of the [gallery](../gallery.md) — run it locally to interact.*
<!-- /gallery -->

> **When to use it**: capture a handwritten signature — a delivery receipt, a service order, a terms acceptance. In the field, on a phone, with a finger.

A canvas driven by `pointer` events (mouse, finger and stylus down the same path). Strokes are kept as **point lists** and the canvas is redrawn from them — that is what makes `undo` possible at all: a canvas holds pixels, not history, so dropping the last stroke means repainting the rest.

```tsx
import { Button, SignaturePad, type SignaturePadHandle } from "tempest-react-sdk";
import { useRef, useState } from "react";

export function DeliverySignature({ deliveryId }: { deliveryId: string }) {
  const pad = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);

  async function submit() {
    const blob = await pad.current?.toBlob("image/png");
    if (!blob) return;
    const form = new FormData();
    form.append("signature", blob, `${deliveryId}.png`);
    await api.post(`/deliveries/${deliveryId}/signature`, form);
  }

  return (
    <>
      <SignaturePad
        label="Customer signature"
        width={360}
        height={180}
        onEmptyChange={setEmpty}
      />
      <Button disabled={empty} onClick={submit}>Confirm delivery</Button>
    </>
  );
}
```

| Prop            | Type                        | Default        | What it does                                                   |
| --------------- | --------------------------- | -------------- | -------------------------------------------------------------- |
| `width`         | `number`                    | `400`          | Surface width in CSS px.                                       |
| `height`        | `number`                    | `160`          | Surface height in CSS px.                                      |
| `penColor`      | `string`                    | computed color | Stroke color. The default follows `--tempest-text`.            |
| `penWidth`      | `number`                    | `2`            | Stroke width.                                                  |
| `disabled`      | `boolean`                   | `false`        | Blocks drawing and dims the surface.                           |
| `label`         | `string`                    | `"Signature"`  | Accessible name of the canvas.                                 |
| `onBegin`       | `() => void`                | —              | Called at the start of each stroke.                            |
| `onEnd`         | `(dataUrl: string) => void` | —              | Called at the end of each stroke, with the current image.      |
| `onEmptyChange` | `(isEmpty: boolean) => void`| —              | Called when emptiness changes — wire it to the submit button.   |
| `showActions`   | `boolean`                   | `true`         | Renders the Undo/Clear buttons.                                |

**Imperative handle** (`ref`): `clear()`, `undo()`, `isEmpty()`, `toDataURL(type?, quality?)`, `toBlob(type?, quality?)`.

!!! tip "Upload `toBlob()`, not `toDataURL()`"
    A data URL is base64: ~33% more bytes, and it ends up as a string inside your JSON. `toBlob()` hands you binary ready for `FormData`.

!!! info "Sharpness on a high-density screen"
    The canvas backing store is scaled by `devicePixelRatio` and the context gets the matching `setTransform`. Without it the line comes out blurry on a phone — the classic 1x canvas defect.

!!! note "The ink follows the theme"
    The default reads the canvas' **computed** color, which the CSS binds to `--tempest-text`. A signature drawn in dark mode is light; in light mode, dark. Pass `penColor` only when you need fixed ink (pen blue, say).

## A11y

- Always use `label` — screen readers announce the field.
- `error` adds `aria-invalid="true"` + describes it via `aria-describedby`.
- `required` propagates the native `required` attribute + a visual `*` indicator.
- `PinInput` cells expose individual `aria-label="Digit N"`.
- `PasswordInput.toggle` uses `aria-pressed` and a localized `aria-label`.

## Recap

- Pick the control by **data type** — don't force an `Input` where a `Select`,
  `Switch` or `PinInput` communicates intent better.
- Every field shares `label` / `helperText` / `error` / `required` / `size` and
  forwards its `ref` → they plug straight into `react-hook-form`.
- `error` replaces `helperText` and adds `aria-invalid` automatically — don't
  duplicate the message.

Related pages:

- [Form validation](../forms.md) — `validateForm`, `useZodForm`, BR masks,
  `useViaCEP` and the `<FormField>` wrapper.
- [Layout](./layout.md) — `Form`/`FormSection`/`FormRow`/`FormActions` to
  structure the fields.
- [Actions](./actions.md) — `Button` for the form submit.
- [Status & feedback](./feedback.md) — `Alert`/`Toast` to confirm submit success
  or error.
