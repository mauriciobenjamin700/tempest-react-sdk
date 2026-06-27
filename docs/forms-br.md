# Forms BR — máscaras, validadores, ViaCEP

Tudo que apps brasileiros usam diariamente: validar CPF/CNPJ de verdade, mascarar
entrada enquanto o usuário digita e preencher endereço a partir do CEP. Combina com
[zod + react-hook-form](./forms.md) ou form controlado manual.

!!! info "Por que não validar só o tamanho?"
    "Tem 11 dígitos" não significa que o CPF existe. Documentos brasileiros
    carregam **dígitos verificadores** calculados a partir dos demais — é assim que
    o backend da Receita rejeita números digitados errado. Validar só o tamanho
    deixa passar `123.456.789-00` e qualquer sequência repetida. As funções abaixo
    rodam o algoritmo completo.

## Validadores

```ts
import { validateCPF, validateCNPJ } from "tempest-react-sdk";

validateCPF("529.982.247-25"); // true
validateCPF("111.111.111-11"); // false (rejeita todos-iguais)
validateCPF("12345678900"); // false (dígito verificador inválido)
validateCNPJ("11.222.333/0001-81"); // true
```

Algoritmo completo (dígitos verificadores), não só "11 dígitos". Aceita string com ou sem máscara.

!!! note "Por que rejeitar dígitos repetidos"
    `111.111.111-11`, `000.000.000-00`, etc. **passam** na conta de dígito
    verificador por coincidência matemática — o algoritmo bruto os aceitaria. Como
    nenhum desses é um documento real, ambos os validadores têm um curto-circuito
    explícito (`/^(\d)\1+$/`) que rejeita qualquer valor com todos os dígitos
    iguais antes de calcular.

!!! tip "São puras — combine como quiser"
    `validateCPF` / `validateCNPJ` recebem `string` e devolvem `boolean`, sem
    estado nem React. Use direto num `onBlur`, num `.refine()` do zod (veja o fim
    da página), ou no servidor — é o mesmo código nos dois lados.

## Inputs com máscara

| Componente   | Mask                              | inputMode |
| ------------ | --------------------------------- | --------- |
| `CPFInput`   | `000.000.000-00`                  | numeric   |
| `CNPJInput`  | `00.000.000/0000-00`              | numeric   |
| `PhoneInput` | `(00) 00000-0000` (ou 10 dígitos) | tel       |
| `CEPInput`   | `00000-000`                       | numeric   |
| `MoneyInput` | `R$ X.XXX,XX` (cents)             | numeric   |

API uniforme — todos recebem `value: string` (ou `number` para `MoneyInput`) + `onChange`:

```tsx
import { useState } from "react";
import { CPFInput } from "tempest-react-sdk";

function CPFExample() {
  const [cpf, setCpf] = useState("");
  return <CPFInput value={cpf} onChange={setCpf} label="CPF" required />;
}
```

!!! warning "`onChange` entrega string, não um evento"
    Os inputs mascarados são **controlados** e chamam `onChange(maskedValue)` com a
    string já formatada — **não** com um `ChangeEvent`. Não tente `e.target.value`.
    Para guardar só os dígitos, use [`unmask`](#unmask-strip) na hora de enviar.

`MoneyInput` trabalha em **centavos** (`number`) pra evitar erro de float:

```tsx
import { useState } from "react";
import { MoneyInput } from "tempest-react-sdk";

function PriceExample() {
  const [cents, setCents] = useState(0);
  return <MoneyInput value={cents} onChange={setCents} label="Preço" />;
  // cents=12990 → "R$ 129,90"
}
```

Para outras moedas: `<MoneyInput currency="USD" locale="en-US" />`.

!!! warning "MoneyInput é centavos inteiros — nunca float"
    `value` e `onChange` lidam com **centavos inteiros** (`12990`), não reais
    (`129.90`). Persistir o valor como inteiro evita o clássico `0.1 + 0.2 !== 0.3`.
    Na hora de exibir/calcular em reais, divida por 100 só na borda.

### `unmask` — só os dígitos {#unmask-strip}

```ts
import { unmask } from "tempest-react-sdk";

unmask("529.982.247-25"); // "52998224725"
```

Use antes de enviar pro backend, que normalmente espera dígitos crus. Também
existem `formatCEP` e `formatCNPJ` exportados se você precisar mascarar uma string
fora de um input controlado.

## ViaCEP

`useViaCEP` consulta o serviço público ViaCEP e devolve os campos de endereço — sem
backend próprio.

```tsx
import { useState } from "react";
import { CEPInput, Input, useViaCEP } from "tempest-react-sdk";

function AddressForm() {
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const viacep = useViaCEP();

  async function handleLookup() {
    const result = await viacep.lookup(cep);
    if (result) {
      setStreet(result.logradouro);
      setCity(result.localidade);
      setUf(result.uf);
    }
  }

  return (
    <>
      <CEPInput value={cep} onChange={setCep} onBlur={handleLookup} label="CEP" />
      {viacep.loading && <span>Buscando…</span>}
      {viacep.error && <span role="alert">{viacep.error}</span>}
      <Input value={street} onChange={(e) => setStreet(e.target.value)} label="Rua" />
      <Input value={city} onChange={(e) => setCity(e.target.value)} label="Cidade" />
      <Input value={uf} onChange={(e) => setUf(e.target.value)} label="UF" />
    </>
  );
}
```

Sem backend — usa `https://viacep.com.br/ws/<cep>/json/`.

!!! note "Dois tipos de falha"
    `viacep.error` é setado tanto pra **CEP com formato inválido** (≠ 8 dígitos, sem
    chamada de rede) quanto pra **CEP não encontrado** (a API respondeu `{ erro: true }`).
    Em ambos `lookup` resolve com `null` — sempre cheque o retorno antes de usar.

!!! tip "Dispare no `onBlur`, não a cada tecla"
    `lookup` faz uma requisição HTTP. Chame quando o campo perde foco (`onBlur`) ou
    quando os 8 dígitos estão completos — não a cada keystroke, pra não martelar o
    serviço público.

## Combinando com react-hook-form

Como os validadores são funções puras, eles entram direto num `.refine()` do zod, e
o input mascarado é ligado com um `<Controller>` (ou com o [`<FormField>`](./forms.md)
do SDK, que elimina o boilerplate):

```tsx
import { Controller, useForm } from "react-hook-form";
import { CPFInput, validateCPF, zodResolver } from "tempest-react-sdk";
import { z } from "zod";

const schema = z.object({
  cpf: z.string().refine(validateCPF, "CPF inválido"),
});

function CPFField() {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { cpf: "" } });
  return (
    <Controller
      control={form.control}
      name="cpf"
      render={({ field, fieldState }) => (
        <CPFInput
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          label="CPF"
        />
      )}
    />
  );
}
```

!!! tip "Menos boilerplate com FormField"
    O `<Controller>` acima pode virar uma linha com o `<FormField>` do SDK dentro de
    um `<FormProvider>`: `<FormField name="cpf" label="CPF"><CPFInput /></FormField>`.
    Veja o [exemplo ponta-a-ponta](./forms.md#exemplo-completo-schema-provider-fields-submit).

## Resumo

- `validateCPF` / `validateCNPJ` rodam o **algoritmo de dígito verificador** completo e rejeitam sequências repetidas — são funções puras reaproveitáveis no client e no servidor.
- Os inputs mascarados são **controlados** e chamam `onChange(string)` (não um evento); `MoneyInput` trabalha em **centavos inteiros**.
- `unmask` tira a máscara antes de enviar pro backend.
- `useViaCEP` resolve `null` em qualquer falha (formato inválido ou CEP inexistente) — sempre cheque o retorno; dispare no `onBlur`.
- Plugue os validadores no zod via `.refine()` e ligue os inputs com `<Controller>` ou `<FormField>`.

## Veja também

- [Forms (zod)](./forms.md) — `useZodForm`, `FormField`, layout e o exemplo ponta-a-ponta
- [HTTP](./http.md) — `parseResponse` valida a resposta da API
- [Hooks](./hooks.md) — `useDebounce` para adiar a busca de CEP enquanto digita
