# Forms BR — masks, validators, ViaCEP

Everything Brazilian apps use daily. Pairs with [zod + react-hook-form](./forms.md)
or a manual controlled form.

## Validators

```ts
import { validateCPF, validateCNPJ } from "tempest-react-sdk";

validateCPF("529.982.247-25"); // true
validateCPF("111.111.111-11"); // false (rejects all-equal)
validateCNPJ("11.222.333/0001-81"); // true
```

Full algorithm (check digits), not just "11 digits". Accepts a string with or
without a mask.

## Masked inputs

| Component    | Mask                             | inputMode |
| ------------ | -------------------------------- | --------- |
| `CPFInput`   | `000.000.000-00`                 | numeric   |
| `CNPJInput`  | `00.000.000/0000-00`             | numeric   |
| `PhoneInput` | `(00) 00000-0000` (or 10 digits) | tel       |
| `CEPInput`   | `00000-000`                      | numeric   |
| `MoneyInput` | `R$ X,XXX.XX` (cents)            | numeric   |

Uniform API — they all take `value: string` (or `number` for `MoneyInput`) +
`onChange`:

```tsx
const [cpf, setCpf] = useState("");
<CPFInput value={cpf} onChange={setCpf} label="CPF" required />;
```

`MoneyInput` works in **cents** (`number`) to avoid float errors:

```tsx
const [cents, setCents] = useState(0);
<MoneyInput value={cents} onChange={setCents} label="Price" />;
// cents=12990 → "R$ 129,90"
```

For other currencies: `<MoneyInput currency="USD" locale="en-US" />`.

## ViaCEP

```tsx
import { useViaCEP } from "tempest-react-sdk";

const cep = useViaCEP();
async function lookup() {
  const result = await cep.lookup("01310-100");
  if (result) {
    setStreet(result.logradouro);
    setCity(result.localidade);
    setUf(result.uf);
  }
}
```

No backend — uses `https://viacep.com.br/ws/<cep>/json/`. `cep.error` when
invalid or not found.

## Combining with react-hook-form

```tsx
import { Controller, useForm } from "react-hook-form";
import { CPFInput, validateCPF, zodResolver } from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
  cpf: z.string().refine(validateCPF, "Invalid CPF"),
});

function CPFField() {
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Controller
      control={form.control}
      name="cpf"
      render={({ field, fieldState }) => (
        <CPFInput
          value={field.value ?? ""}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
```

## See also

- [Forms (zod)](./forms.md)
- [HTTP](./http.md) — `parseResponse` validates the API response
