# Pagamentos & fiscal BR

Os quatro trilhos que todo produto brasileiro acaba precisando: **Pix**, **boleto**, **chave de acesso da NFe** e **feriados / dias úteis**. Tudo puro TypeScript, **sem nenhuma dependência nova** — a fatia inteira mede **9,22 KB brotli**, e só Pix (payload + CRC + componente de QR) mede **6,1 KB**.

!!! info "Import pelo subpath `tempest-react-sdk/br`"
    Igual ao resto do módulo BR, estes helpers vivem em `tempest-react-sdk/br` — não na raiz. Quem não importa, não paga.

    ```ts
    import { pixPayload, parseLinhaDigitavel, parseChaveNFe, isBusinessDay } from "tempest-react-sdk/br";
    ```

!!! warning "O SDK não fala com banco nenhum"
    Nada aqui consulta o Bacen, a SEFAZ ou uma API de PSP. São **codificadores e validadores locais**: eles montam a string certa, conferem os dígitos verificadores e leem os campos. Se um boleto existe, está registrado ou já foi pago — só o banco responde. Se uma NF-e foi autorizada — só a SEFAZ.

---

## Parte 1 — Pix

### O problema

Um QR de Pix não é um QR "de link". É um payload **EMV MPM** (o mesmo padrão da EMVCo que o Bacen adotou no "Manual de Padrões para Iniciação do Pix"): uma lista de triplas `ID + tamanho de 2 dígitos + valor`, terminada por um CRC-16.

Escrever isso na mão dá errado sempre no mesmo lugar — o checksum. Ele é CRC-16/CCITT-FALSE (polinômio `0x1021`, valor inicial `0xFFFF`) calculado sobre **todo o payload anterior mais os literais `6304`**, ou seja, incluindo o cabeçalho da própria tag 63. Errar isso produz um QR que abre no app e falha na leitura.

### O caminho curto: `<PixQRCode>`

```tsx
import { PixQRCode } from "tempest-react-sdk/br";

export function CheckoutPix() {
  return (
    <PixQRCode
      pix={{
        key: "loja@tempest.dev",
        merchantName: "Loja Tempest",
        merchantCity: "São Paulo",
        amount: 25.5,
        txid: "PEDIDO123",
      }}
      amountLabel="R$ 25,50"
      payeeLabel="Loja Tempest"
    />
  );
}
```

Isso renderiza o símbolo **e** a linha copia-e-cola com botão de copiar. As duas coisas juntas não é enfeite:

!!! tip "Nunca mostre só o QR"
    Num checkout mobile, o QR aparece **no mesmo aparelho** que iria escaneá-lo. Sem a string copiável, o usuário fica travado. É o erro mais comum de tela de Pix.

O payload é montado no navegador e o QR é desenhado pelo encoder próprio do SDK (o mesmo do [`QRCode`](./components/utility.md#qrcode)). Chave, valor e txid **não saem da página** — um serviço de imagem de QR receberia os três.

Quando o payload vem pronto do PSP (cobrança dinâmica assinada), passe direto:

```tsx
<PixQRCode payload={charge.brcode} level="Q" size={220} />
```

!!! warning "`pix` e `payload` são mutuamente exclusivos"
    Passar os dois lança `PixError`. Prefira `payload` para cobrança dinâmica: aquela string foi o PSP que emitiu, e remontá-la aqui só cria um jeito de errar.

### `pixPayload` — a string, sem UI

```ts
import { pixPayload } from "tempest-react-sdk/br";

const payload = pixPayload({
  key: "12345678909",
  merchantName: "Loja Tempest",
  merchantCity: "Sao Paulo",
  amount: 25.5,
  txid: "PEDIDO123",
});

// 00020101021126330014br.gov.bcb.pix0111123456789095204000053039865405
// 25.505802BR5912Loja Tempest6009Sao Paulo62130509PEDIDO1236304D68C
```

Campos aceitos:

| Campo | Tag | Obrigatório | Nota |
| --- | --- | --- | --- |
| `key` | 26 / 01 | ✅ | CPF, CNPJ, e-mail, telefone ou EVP. Validada e normalizada. |
| `merchantName` | 59 | ✅ | Máx. **25** caracteres. Acima disso, erro. |
| `merchantCity` | 60 | ✅ | Máx. **15** caracteres. |
| `amount` | 54 | — | Reais. Omita para o pagador digitar o valor. |
| `txid` | 62 / 05 | — | `[A-Za-z0-9]{1,25}`. Default `***`. |
| `description` | 26 / 02 | — | Texto livre que alguns apps mostram. |
| `postalCode` | 61 | — | CEP, só dígitos. |
| `oneTime` | 01 | — | `true` → tag `12` (uso único) em vez de `11`. |

### Estático × dinâmico

A distinção **muda o que liquida**, então não é cosmética:

=== "Estático"

    A tag 26 carrega a **chave**. O QR é autocontido, pode ser impresso e reusado. Se `amount` for omitido, liquida com o valor que o pagador digitou.

    ```ts
    pixPayload({
      key: "loja@tempest.dev",
      merchantName: "Tempest",
      merchantCity: "Belo Horizonte",
    });
    ```

=== "Dinâmico"

    A tag 26 carrega uma **URL** (`payloadLocation`), e a carteira busca valor e recebedor no PSP. Liquida com o que o PSP serviu. Default: uso único.

    ```ts
    pixPayload({
      kind: "dynamic",
      url: "pix.example.com/qr/v2/abc123",
      merchantName: "Tempest",
      merchantCity: "Recife",
    });
    ```

!!! tip "Cobrança que precisa reconciliar centavo a centavo pede dinâmico"
    Um QR estático sem valor liquida o que o pagador digitou — inclusive R$ 1,00 numa fatura de R$ 100,00.

### Chaves: validação e a armadilha dos 11 dígitos

```ts
import { normalizePixKey, pixKeyType } from "tempest-react-sdk/br";

pixKeyType("123.456.789-09"); // "cpf"
pixKeyType("11.222.333/0001-81"); // "cnpj"
pixKeyType("loja@tempest.dev"); // "email"
pixKeyType("+5511987654321"); // "phone"
pixKeyType("123e4567-e89b-12d3-a456-426614174000"); // "evp"
pixKeyType("não é chave"); // null

normalizePixKey("(11) 98765-4321"); // { type: "phone", value: "+5511987654321" }
```

CPF e CNPJ passam por `validateCPF` / `validateCNPJ` (os mesmos de [Forms BR](./forms-br.md)) — chave com dígito verificador errado é rejeitada com `PixError`.

!!! danger "CPF e celular nacional têm os dois 11 dígitos"
    `"11987654321"` é um celular válido **e** poderia ser um CPF. O desempate é o dígito verificador: 11 dígitos com DV válido viram `"cpf"`, o resto vira `"phone"`. Passe telefone como `+5511987654321` e a ambiguidade desaparece.

### Acentos

O conjunto de caracteres do BR Code não tem acento. O SDK **remove os diacríticos** e rejeita o que sobrar fora do ASCII imprimível:

```ts
pixPayload({ key: "…", merchantName: "Padaria Açúcar", merchantCity: "São Paulo" });
// → "5914Padaria Acucar" … "6009Sao Paulo"

pixPayload({ key: "…", merchantName: "Loja ✅", merchantCity: "Recife" });
// → PixError: merchantName has characters the BR Code cannot carry
```

!!! note "Por que remover em vez de lançar"
    "São Paulo" é o nome real da cidade e o payload não pode carregá-lo. Um QR que não escaneia é pior do que um nome sem cedilha. Já um emoji é erro de quem chamou, e esse aparece.

### Lendo um payload de volta

```ts
import { parsePixPayload } from "tempest-react-sdk/br";

const data = parsePixPayload(colado);
data.key; // "12345678909"
data.amount; // 25.5
data.txid; // "PEDIDO123"
data.crcValid; // true
data.fields; // toda TLV, na ordem, inclusive as desconhecidas
```

É **tolerante com tag desconhecida** — PSPs adicionam templates próprios, e um leitor que rejeita isso não serve em produção. O que **não** é tolerado: frame quebrado (tamanho que passa do fim, `6304` ausente) e **CRC divergente**, que lança. Para inspecionar um payload que você já sabe estar corrompido:

```ts
parsePixPayload(colado, { requireCrc: false }); // crcValid: false, sem lançar
```

!!! danger "CRC divergente não é aviso"
    Um BR Code com checksum errado foi corrompido no caminho, e a conta que ele aponta agora **não é** a conta que o recebedor publicou. Por isso o default lança.

### `pixCrc16`, se você precisa do checksum sozinho

```ts
import { pixCrc16 } from "tempest-react-sdk/br";

pixCrc16("123456789"); // "29B1" — o check value publicado do CRC-16/CCITT-FALSE
pixCrc16(payload.slice(0, -4)); // os 4 hex que fecham o payload
```

---

## Parte 2 — Boleto

### Dois layouts, o mesmo tamanho

O código de barras tem 44 dígitos nos dois casos, e é aí que mora o bug:

| | Primeiro dígito | Linha digitável | Uso |
| --- | --- | --- | --- |
| **Cobrança** (`"banco"`) | ≠ 8 | 47 dígitos | Boleto de banco contra uma fatura |
| **Arrecadação** (`"arrecadacao"`) | `8` | 48 dígitos | Concessionária, tributo, multa |

Não são variantes de um formato: **todo campo muda de posição e de significado**. O SDK detecta pelo primeiro dígito e devolve uma união discriminada — estreite por `kind` antes de ler.

### Ler o que o leitor de código de barras entregou

```ts
import { parseCodigoBarras, parseLinhaDigitavel } from "tempest-react-sdk/br";

const boleto = parseCodigoBarras("34191157000001234560000123456789012345678901");

if (boleto.kind === "banco") {
  boleto.banco; // "341"
  boleto.valor; // 1234.56
  boleto.vencimento; // Date — 2026-09-15
  boleto.linhaDigitavel; // 47 dígitos, já com os DVs
} else {
  boleto.segmentoLabel; // "Órgãos governamentais"
  boleto.valor; // reais, ou null quando o campo é referência
  boleto.empresa; // código FEBRABAN, ou prefixo do CNPJ no segmento 6
}
```

`parseLinhaDigitavel` faz o caminho inverso e aceita as duas linhas (47 ou 48). Os dois parsers **conferem todos os dígitos verificadores** que o layout permite conferir: os 3 (banco) ou 4 (arrecadação) DVs de bloco, mais o DV geral. Qualquer um errado lança `BoletoError` dizendo qual.

Conversão explícita, quando você só quer a outra representação:

```ts
import { codigoBarrasToLinhaDigitavel, linhaDigitavelToCodigoBarras } from "tempest-react-sdk/br";

linhaDigitavelToCodigoBarras("34190000172345678901723456789017115700000123456");
// "34191157000001234560000123456789012345678901"
```

### Validar entrada digitada

```ts
import { formatLinhaDigitavel, validateBoleto } from "tempest-react-sdk/br";

validateBoleto(input); // true / false, sem lançar
formatLinhaDigitavel(input);
// "34190.00017 23456.789017 23456.789017 1 15700000123456"
```

`formatLinhaDigitavel` é helper de **exibição**: entrada que não tem 47 nem 48 dígitos volta intacta.

### Só o layout, sem parsear: `boletoKind`

Para ramificar a UI antes de validar (mostrar o campo certo, escolher o ícone),
`boletoKind` diz o layout a partir do tamanho e do primeiro dígito, e devolve
`null` para entrada que não é boleto — sem lançar:

```ts
import { boletoKind } from "tempest-react-sdk/br";

boletoKind("34191157000001234560000123456789012345678901"); // "banco"
boletoKind("848900000017..."); // "arrecadacao"
boletoKind("123"); // null
```

E `boletoDueDate(fator, options?)` resolve o fator de vencimento isolado — útil
quando o fator veio de outro sistema e você não tem o código de barras inteiro.
Devolve `{ date, epoch }` (dizendo **qual** base foi usada) ou `null` quando o
fator é `0`, que é o valor de "sem vencimento":

```ts
import { boletoDueDate } from "tempest-react-sdk/br";

boletoDueDate(1000, { epoch: "legacy" }); // { date: 2000-07-03, epoch: "legacy" }
boletoDueDate(1000, { epoch: "current" }); // { date: 2025-02-22, epoch: "current" }
boletoDueDate(0); // null
```

O `epoch` de volta importa: ele diz qual das duas leituras ambíguas (abaixo)
saiu, o que é a diferença entre exibir a data e exibir a data **certa**.

### A virada do fator de vencimento (fev/2025)

O vencimento não está no boleto como data — está como **fator de vencimento**, quatro dígitos contando dias desde uma data-base. E essa data-base **mudou**:

- Base original **07/10/1997**. O campo saturou em `9999` no dia **21/02/2025**.
- A partir de **22/02/2025** o contador reiniciou em `1000` sobre a nova base **29/05/2022** (comunicado FEBRABAN FB-009/2023).

!!! danger "As duas leituras são genuinamente ambíguas"
    Todo fator entre 1000 e 9999 tem uma leitura em cada base — a antiga cai em `2000-07-03 … 2025-02-21`, a nova em `2025-02-22 … 2049-10-14`. **Nada no código de barras diz qual.**

    O default `"auto"` escolhe a que cai mais perto de `reference` (hoje, por default). Isso acerta o caso que importa — um boleto sendo pago agora — e erra numa varredura de arquivo histórico. Quando você sabe, diga:

    ```ts
    parseCodigoBarras(barcode, { epoch: "current" }); // base 29/05/2022
    parseCodigoBarras(barcode, { epoch: "legacy" }); // base 07/10/1997
    parseCodigoBarras(barcode, { reference: new Date(2025, 5, 1) });
    ```

O campo resolvido vem acompanhado de qual base foi usada, então a UI pode avisar:

```ts
const boleto = parseCodigoBarras(barcode);
if (boleto.kind === "banco") {
  boleto.fatorVencimento; // 1570
  boleto.vencimentoEpoch; // "current"
  boleto.vencimento; // Date, ou null quando o fator é 0 (boleto sem vencimento)
}
```

Para emitir, o inverso:

```ts
import { fatorVencimento } from "tempest-react-sdk/br";

fatorVencimento(new Date(2025, 1, 22)); // 1000 — base atual
fatorVencimento(new Date(2025, 1, 21), "legacy"); // 9999
fatorVencimento(new Date(2020, 0, 1)); // BoletoError — nenhum fator representa isso
```

### Arrecadação: o que é lido e o que não é

A posição 3 diz duas coisas ao mesmo tempo — se o valor é dinheiro e qual módulo calcula o DV geral:

| Posição 3 | Valor | DV geral |
| --- | --- | --- |
| `6` | Reais | módulo 10 |
| `7` | Quantidade de moeda / referência | módulo 10 |
| `8` | Reais | módulo 11 |
| `9` | Quantidade de moeda / referência | módulo 11 |

Com `7` ou `9`, `valor` vem `null` e o campo cru fica em `valorRaw` — o SDK **não** finge que uma referência é dinheiro. Posição 3 fora de `6-9` é rejeitada em vez de lida errado.

!!! warning "`vencimentoCampoLivre` é pista, não data de liquidação"
    O layout diz que uma data de vencimento, **se existir**, ocupa os 8 primeiros dígitos do campo livre como `AAAAMMDD`. Mas o campo é opcional e nada marca sua presença, então um campo livre que só *parece* data também cai ali. Use na UI; nunca para liquidar.

### Os três dígitos verificadores, exportados

Aparecem em qualquer integração FEBRABAN, então estão no barrel:

```ts
import { mod10Dac, mod11DacArrecadacao, mod11DacCobranca } from "tempest-react-sdk/br";

mod10Dac("01230067896"); // 3 — o exemplo resolvido do layout FEBRABAN v7
```

!!! danger "Módulo 11 de cobrança ≠ módulo 11 de arrecadação"
    Mesmos pesos, mesma subtração — e regras **diferentes** para os restos degenerados. Cobrança resolve resto `0`, `1` e `10` para **`1`**; arrecadação resolve resto `0` e `1` para **`0`**. Usar um no layout do outro dá dígito errado exatamente 3 vezes em 11, o que passa em teste feito com uma amostra pequena. São funções separadas por isso.

---

## Parte 3 — Chave de acesso da NFe

Os 44 dígitos que identificam qualquer documento fiscal eletrônico:

```text
35 2601 12345678000195 55 001 000000123 1 12345678 5
cUF AAMM CNPJ           mod série nNF    tp cNF     cDV
```

```ts
import { formatChaveNFe, parseChaveNFe, validateChaveNFe } from "tempest-react-sdk/br";

validateChaveNFe(input); // true / false

const chave = parseChaveNFe("35260112345678000195550010000001231123456785");
chave.uf; // "SP" — o tipo UF do próprio módulo br
chave.ano; // 2026
chave.mes; // 1
chave.cnpj; // "12345678000195"
chave.modeloLabel; // "NF-e"
chave.serie; // "001"
chave.numero; // "000000123"
chave.tipoEmissaoLabel; // "Normal"

chave.dv; // "5"

formatChaveNFe("35260112345678000195550010000001231123456785");
// "3526 0112 3456 7800 0195 5500 1000 0001 2311 2345 6785"
```

`validateChaveNFe` confere três coisas: 44 dígitos, `cUF` que é uma UF de verdade, e DV que recalcula (módulo 11, pesos 2–9 da direita para a esquerda, resto `0` ou `1` → dígito `0`).

!!! note "O layout é compartilhado — `modelo` é o que diz o que você tem na mão"
    NF-e (`55`), NFC-e (`65`), CT-e (`57`), MDF-e (`58`), BP-e (`63`), NF3e (`66`)… todos usam a mesma chave de 44 dígitos. Modelo fora da tabela vem com `modeloLabel: null` em vez de um chute.

!!! tip "O `cUF` vira o tipo `UF`"
    `chave.uf` é o mesmo union `UF` que `citiesByUf`, `getState` e o `BrazilMap` usam — dá para encadear direto com o resto do módulo BR.

### Emitindo: calcular o DV e tratar o erro

Quem **monta** a chave (em vez de só ler uma pronta) precisa do dígito
verificador dos 43 primeiros dígitos. `chaveNFeCheckDigit` faz esse cálculo
isolado, e lança `ChaveNFeError` quando o corpo não tem exatamente 43 dígitos:

```ts
import { ChaveNFeError, chaveNFeCheckDigit } from "tempest-react-sdk/br";

const corpo = "3526011234567800019555001000000123112345678"; // 43 dígitos

try {
  const dv = chaveNFeCheckDigit(corpo); // 5
  const chave = `${corpo}${dv}`;
} catch (err) {
  if (err instanceof ChaveNFeError) console.error(err.message);
}
```

`ChaveNFeError` é a única exceção do grupo NFe — `validateChaveNFe` continua
devolvendo `false` em vez de lançar, porque validar entrada de usuário não é
caso excepcional.

---

## Parte 4 — Feriados e dias úteis

### O que está na tabela

```ts
import { holidaysFor } from "tempest-react-sdk/br";

holidaysFor(2026);
// 13 entradas: 9 feriados nacionais + 4 dias móveis do sistema financeiro
```

Cada entrada traz `date` (`YYYY-MM-DD`), `name`, `movable` e um `kind`:

- **`"national"`** — feriado nacional em lei federal. 9 datas fixas (Lei 662/1949 com a redação da Lei 10.607/2002, Lei 6.802/1980 para 12 de outubro, Lei 14.759/2023 para 20 de novembro).
- **`"banking"`** — não é feriado em lei, mas o sistema financeiro não opera: **Carnaval (segunda e terça)**, **Sexta-feira da Paixão** e **Corpus Christi**. Agência fechada, compensação parada — um boleto ou uma TED datada aí liquida depois.

!!! info "Por que os dois tipos existem"
    Carnaval e Corpus Christi **não são feriados nacionais por lei** — mas a Resolução CMN 4.880/2020 fecha os bancos nos quatro dias. Se você calcula prazo de pagamento, os dois contam; se você calcula obrigação trabalhista, só `"national"` conta. O default é o calendário bancário, porque é o que quebra dinheiro:

    ```ts
    isBusinessDay("2026-04-03"); // false — Sexta-feira da Paixão
    isBusinessDay("2026-04-03", { kinds: ["national"] }); // true
    ```

### O que **não** está, e não vai estar

!!! danger "Feriado estadual e municipal não estão cobertos"
    A data magna varia por estado e cada um dos 5 570 municípios pode declarar os seus, incluindo até quatro dias religiosos. Nenhuma tabela fica completa e atualizada. Passe pelo `extra`:

    ```ts
    const SAO_PAULO = ["2026-01-25", "2026-07-09", "2026-11-20"];
    isBusinessDay("2026-07-09", { extra: SAO_PAULO }); // false
    ```

Também de fora, de propósito:

- **Ponto facultativo.** Decreto que libera servidor público não é feriado e não muda prazo de ninguém.
- **História pré-2002.** A tabela codifica a lei como está hoje. Pedir 1998 devolve o conjunto de hoje deslocado para 1998, não o que valia então. A única exceção modelada é 20 de novembro, que só aparece **a partir de 2024**.

### Aritmética de dia útil

```ts
import { addBusinessDays, isBusinessDay, isHoliday, nextBusinessDay } from "tempest-react-sdk/br";

isHoliday("2026-11-20"); // true
isBusinessDay("2026-08-03"); // true — segunda-feira comum

nextBusinessDay("2026-12-24"); // 2026-12-28 — pula o Natal e o fim de semana
addBusinessDays("2026-04-01", 2); // 2026-04-06 — pula a Paixão e o fim de semana
addBusinessDays("2026-04-06", -2); // 2026-04-01 — negativo anda para trás
```

Aceitam `Date` ou `"YYYY-MM-DD"` e devolvem `Date` na **meia-noite local**.

!!! warning "Tudo é calendário local, nunca UTC"
    "Hoje é feriado?" é pergunta sobre o calendário de quem está olhando. Os helpers usam `getFullYear/getMonth/getDate` e constroem com `new Date(y, m, d)`; passar por `toISOString()` deslocaria o dia para todo viewer a leste de Greenwich.

!!! note "`addBusinessDays(date, 0)` devolve o dia intacto"
    Mesmo quando não é dia útil. Ajustar em silêncio esconderia justo o caso que você precisa ver.

### Onde a Páscoa entra

Os quatro dias móveis são derivados do domingo de Páscoa, não listados:

```ts
import { easterSunday } from "tempest-react-sdk/br";

easterSunday(2026); // 2026-04-05
```

É o *computus* gregoriano anônimo (Meeus/Jones/Butcher): aritmética inteira sobre o ano, sem tabela e sem dependência — exato para qualquer ano gregoriano.

---

## Recapitulando

- **Pix** — `pixPayload` monta o BR Code EMV com o CRC-16/CCITT-FALSE certo (incluindo os literais `6304`); `parsePixPayload` lê de volta, tolerante com tag desconhecida e intolerante com checksum errado; `<PixQRCode>` desenha o símbolo **e** a copia-e-cola, porque num celular só o QR não serve.
- **Boleto** — `parseLinhaDigitavel` / `parseCodigoBarras` convertem 47↔44 e 48↔44 conferindo todo DV; cobrança e arrecadação são layouts diferentes e o SDK nunca confunde os dois; o fator de vencimento tem **duas** bases desde fev/2025 e a escolha é explícita.
- **NFe** — `parseChaveNFe` abre os 44 dígitos e resolve o `cUF` no tipo `UF` do módulo; `validateChaveNFe` confere tamanho, UF e DV.
- **Feriados** — `holidaysFor` devolve os 9 feriados nacionais + os 4 dias bancários móveis, marcados; estado e município entram por `extra`; `isBusinessDay` / `nextBusinessDay` / `addBusinessDays` fazem a conta no calendário local.

Nada disso fala com banco. Para o lado servidor (registrar boleto, criar cobrança Pix, autorizar NF-e), veja [Integração FastAPI](./integration-fastapi.md).
