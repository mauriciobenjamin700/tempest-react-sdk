# Forms BR — máscaras, validadores, ViaCEP

Tudo que apps brasileiros usam diariamente. Combina com [zod + react-hook-form](./forms.md) ou form controlado manual.

## Validadores

```ts
import { validateCPF, validateCNPJ } from "tempest-react-sdk";

validateCPF("529.982.247-25");   // true
validateCPF("111.111.111-11");   // false (rejeita todos-iguais)
validateCNPJ("11.222.333/0001-81"); // true
```

Algoritmo completo (dígitos verificadores), não só "11 dígitos". Aceita string com ou sem máscara.

## Inputs com máscara

| Componente | Mask | inputMode |
|------------|------|-----------|
| `CPFInput` | `000.000.000-00` | numeric |
| `CNPJInput` | `00.000.000/0000-00` | numeric |
| `PhoneInput` | `(00) 00000-0000` (ou 10 dígitos) | tel |
| `CEPInput` | `00000-000` | numeric |
| `MoneyInput` | `R$ X.XXX,XX` (cents) | numeric |

API uniforme — todos recebem `value: string` (ou `number` para `MoneyInput`) + `onChange`:

```tsx
const [cpf, setCpf] = useState("");
<CPFInput value={cpf} onChange={setCpf} label="CPF" required />;
```

`MoneyInput` trabalha em **centavos** (`number`) pra evitar erro de float:

```tsx
const [cents, setCents] = useState(0);
<MoneyInput value={cents} onChange={setCents} label="Preço" />;
// cents=12990 → "R$ 129,90"
```

Para outras moedas: `<MoneyInput currency="USD" locale="en-US" />`.

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

Sem backend — usa `https://viacep.com.br/ws/<cep>/json/`. `cep.error` quando inválido ou não encontrado.

## Combinando com react-hook-form

```tsx
import { Controller, useForm } from "react-hook-form";
import { CPFInput, validateCPF, zodResolver } from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
    cpf: z.string().refine(validateCPF, "CPF inválido"),
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

## Veja também

- [Forms (zod)](./forms.md)
- [HTTP](./http.md) — `parseResponse` valida a resposta da API
