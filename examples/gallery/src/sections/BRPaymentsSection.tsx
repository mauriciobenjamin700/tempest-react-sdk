import { useState, type ReactElement } from "react";
import { Badge, Input } from "tempest-react-sdk";
import {
    addBusinessDays,
    holidaysFor,
    isBusinessDay,
    parseChaveNFe,
    parseLinhaDigitavel,
    pixPayload,
    PixQRCode,
    validateBoleto,
    validateChaveNFe,
    type Boleto,
    type ChaveNFe,
    type Holiday,
} from "tempest-react-sdk/br";
import { Example } from "../Example";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

/** `YYYY-MM-DD` of a local date, without going through UTC. */
function iso(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

/**
 * Live Pix builder.
 *
 * The point of the section is that the payload underneath the symbol is visible
 * and copyable: typing a key or an amount rewrites both, which is how it becomes
 * obvious that the QR is just an encoding of that string — and that the string is
 * what a wallet actually consumes.
 *
 * The payload is built here with `pixPayload` and handed to `<PixQRCode payload>`
 * rather than letting the component build it from `pix`. A live field means an
 * invalid key on almost every keystroke, and `pixPayload` throws on those —
 * catching it around the call keeps the playground editable, where a throw from
 * inside render would need an `ErrorBoundary` and a remount per character.
 */
function PixDemo(): ReactElement {
    const [key, setKey] = useState("loja@tempest.dev");
    const [amount, setAmount] = useState("25.50");

    const parsed = Number(amount);
    const hasAmount = Number.isFinite(parsed) && parsed > 0;
    let payload: string | null = null;
    let error: string | null = null;
    try {
        payload = pixPayload({
            key,
            merchantName: "Loja Tempest",
            merchantCity: "São Paulo",
            ...(hasAmount ? { amount: parsed } : {}),
            txid: "PEDIDO123",
        });
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Input
                    label="Chave Pix"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="CPF, CNPJ, e-mail, +55… ou EVP"
                />
                <Input
                    label="Valor (R$)"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="vazio = pagador escolhe"
                />
            </div>
            {payload !== null && (
                <PixQRCode
                    payload={payload}
                    amountLabel={hasAmount ? BRL.format(parsed) : undefined}
                    payeeLabel="Loja Tempest"
                />
            )}
            {error !== null && <Badge variant="danger">{error}</Badge>}
        </div>
    );
}

const BOLETO_SAMPLES = [
    {
        label: "Cobrança (47 dígitos)",
        value: "34190000172345678901723456789017115700000123456",
    },
    {
        label: "Arrecadação (48 dígitos)",
        value: "856000000120345612342021609150000006000000000000",
    },
] as const;

/** Boleto reader: paste a typed line, watch every check digit be verified. */
function BoletoDemo(): ReactElement {
    const [value, setValue] = useState<string>(BOLETO_SAMPLES[0].value);

    let boleto: Boleto | null = null;
    let error: string | null = null;
    try {
        boleto = parseLinhaDigitavel(value);
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BOLETO_SAMPLES.map((sample) => (
                    <button key={sample.label} type="button" onClick={() => setValue(sample.value)}>
                        {sample.label}
                    </button>
                ))}
            </div>
            <Input
                label="Linha digitável"
                value={value}
                onChange={(event) => setValue(event.target.value)}
            />
            <Badge variant={validateBoleto(value) ? "success" : "danger"}>
                {validateBoleto(value) ? "dígitos verificadores OK" : "inválido"}
            </Badge>
            {error !== null && (
                <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{error}</code>
            )}
            {boleto !== null && (
                <dl
                    style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr)",
                        gap: "4px 12px",
                        overflowWrap: "anywhere",
                        margin: 0,
                    }}
                >
                    <dt>kind</dt>
                    <dd>
                        <code>{boleto.kind}</code>
                    </dd>
                    <dt>código de barras</dt>
                    <dd>
                        <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                            {boleto.codigoBarras}
                        </code>
                    </dd>
                    {boleto.kind === "banco" ? (
                        <>
                            <dt>banco</dt>
                            <dd>{boleto.banco}</dd>
                            <dt>valor</dt>
                            <dd>{BRL.format(boleto.valor)}</dd>
                            <dt>vencimento</dt>
                            <dd>
                                {boleto.vencimento === null
                                    ? "sem vencimento (fator 0)"
                                    : `${DATE.format(boleto.vencimento)} · base "${boleto.vencimentoEpoch}"`}
                            </dd>
                        </>
                    ) : (
                        <>
                            <dt>segmento</dt>
                            <dd>{boleto.segmentoLabel ?? `${boleto.segmento} (fora do layout)`}</dd>
                            <dt>valor</dt>
                            <dd>
                                {boleto.valor === null
                                    ? `referência: ${boleto.valorRaw}`
                                    : BRL.format(boleto.valor)}
                            </dd>
                            <dt>DV geral</dt>
                            <dd>
                                {boleto.dv} (módulo {boleto.dvModulo})
                            </dd>
                        </>
                    )}
                </dl>
            )}
        </div>
    );
}

/** NFe access-key reader. */
function ChaveNFeDemo(): ReactElement {
    const [value, setValue] = useState("35260112345678000195550010000001231123456785");

    let chave: ChaveNFe | null = null;
    let error: string | null = null;
    try {
        chave = parseChaveNFe(value);
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
            <Input
                label="Chave de acesso (44 dígitos)"
                value={value}
                onChange={(event) => setValue(event.target.value)}
            />
            <Badge variant={validateChaveNFe(value) ? "success" : "danger"}>
                {validateChaveNFe(value) ? "chave válida" : "chave inválida"}
            </Badge>
            {error !== null && (
                <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{error}</code>
            )}
            {chave !== null && (
                <dl
                    style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr)",
                        gap: "4px 12px",
                        overflowWrap: "anywhere",
                        margin: 0,
                    }}
                >
                    <dt>UF</dt>
                    <dd>
                        {chave.uf} (cUF {chave.cUF})
                    </dd>
                    <dt>emissão</dt>
                    <dd>
                        {String(chave.mes).padStart(2, "0")}/{chave.ano}
                    </dd>
                    <dt>CNPJ</dt>
                    <dd>{chave.cnpj}</dd>
                    <dt>modelo</dt>
                    <dd>
                        {chave.modelo} — {chave.modeloLabel ?? "fora da tabela"}
                    </dd>
                    <dt>série / número</dt>
                    <dd>
                        {chave.serie} / {chave.numero}
                    </dd>
                    <dt>tipo de emissão</dt>
                    <dd>{chave.tipoEmissaoLabel ?? chave.tipoEmissao}</dd>
                </dl>
            )}
        </div>
    );
}

/**
 * Result of a calendar helper, or an em dash when it refused the input.
 *
 * A live date field is half-typed most of the time and the helpers throw on a
 * malformed date by design, so the playground shows a placeholder instead of
 * blowing up between keystrokes.
 */
function orDash(compute: () => string): string {
    try {
        return compute();
    } catch {
        return "—";
    }
}

/** Holiday calendar + business-day arithmetic for one year. */
function HolidaysDemo(): ReactElement {
    const [year, setYear] = useState(2026);
    const [from, setFrom] = useState("2026-04-01");
    const [days, setDays] = useState(2);

    const holidays: Holiday[] = holidaysFor(year);
    const landed = orDash(() => iso(addBusinessDays(from, days)));
    const working = orDash(() => String(isBusinessDay(from)));

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Input
                    label="Ano"
                    type="number"
                    value={String(year)}
                    onChange={(event) => setYear(Number(event.target.value) || 2026)}
                />
                <Input
                    label="A partir de"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                />
                <Input
                    label="+ dias úteis"
                    type="number"
                    value={String(days)}
                    onChange={(event) => setDays(Number(event.target.value) || 0)}
                />
            </div>
            <p>
                <code>
                    addBusinessDays(&quot;{from}&quot;, {days})
                </code>{" "}
                → <strong>{landed}</strong>
                {" · "}
                <code>isBusinessDay(&quot;{from}&quot;)</code> → <strong>{working}</strong>
            </p>
            <ul
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gap: 4,
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                }}
            >
                {holidays.map((holiday) => (
                    <li
                        key={holiday.date}
                        style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                        <code style={{ minWidth: 96 }}>{holiday.date}</code>
                        <span style={{ flex: 1 }}>{holiday.name}</span>
                        <Badge variant={holiday.kind === "national" ? "primary" : "warning"}>
                            {holiday.kind}
                        </Badge>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Demo of the BR payment/fiscal rails: Pix BR Code, boleto, NFe access key and
 * the national holiday calendar. Everything is local — no dependency, no network.
 */
export function BRPaymentsSection() {
    return (
        <>
            <Example
                id="br-pix"
                title="Pix — BR Code ao vivo"
                note="Payload EMV montado no browser, CRC-16/CCITT-FALSE incluído. Chave, valor e txid não saem da página."
                code={`import { PixQRCode } from "tempest-react-sdk/br";

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
/>`}
                props={[
                    {
                        name: "pix",
                        type: "PixInput",
                        description: "Estático (chave) ou dinâmico (URL). Exclusivo com `payload`.",
                    },
                    {
                        name: "payload",
                        type: "string",
                        description: "Copia-e-cola já pronto do PSP, usado literalmente.",
                    },
                    { name: "size", type: "number", default: "192", description: "Lado em px." },
                    {
                        name: "level",
                        type: '"L" | "M" | "Q" | "H"',
                        default: '"M"',
                        description: "Correção de erro. Suba para QR impresso.",
                    },
                    {
                        name: "showCopy",
                        type: "boolean",
                        default: "true",
                        description: "Renderiza a linha copia-e-cola e o botão.",
                    },
                ]}
            >
                <PixDemo />
            </Example>

            <Example
                id="br-boleto"
                title="Boleto — linha digitável ↔ código de barras"
                note="Cobrança (47) e arrecadação (48) são layouts diferentes; todo dígito verificador é conferido."
                code={`import { parseLinhaDigitavel, validateBoleto } from "tempest-react-sdk/br";

validateBoleto(input); // true / false

const boleto = parseLinhaDigitavel(input);
if (boleto.kind === "banco") {
  boleto.valor;        // 1234.56
  boleto.vencimento;   // Date | null
  boleto.codigoBarras; // 44 dígitos
}`}
            >
                <BoletoDemo />
            </Example>

            <Example
                id="br-chave-nfe"
                title="Chave de acesso da NFe"
                note="44 dígitos: cUF, AAMM, CNPJ, modelo, série, número, tpEmis, cNF, DV por módulo 11."
                code={`import { parseChaveNFe, validateChaveNFe } from "tempest-react-sdk/br";

validateChaveNFe(input);

const chave = parseChaveNFe(input);
chave.uf;         // "SP" — o tipo UF do módulo br
chave.modeloLabel; // "NF-e"`}
            >
                <ChaveNFeDemo />
            </Example>

            <Example
                id="br-feriados"
                title="Feriados & dias úteis"
                note="9 feriados nacionais + 4 dias bancários móveis derivados da Páscoa. Estadual e municipal entram por `extra`."
                code={`import { addBusinessDays, holidaysFor, isBusinessDay } from "tempest-react-sdk/br";

holidaysFor(2026);              // 13 entradas, cada uma com kind
isBusinessDay("2026-04-03");    // false — Sexta-feira da Paixão
addBusinessDays("2026-04-01", 2); // 2026-04-06`}
            >
                <HolidaysDemo />
            </Example>
        </>
    );
}
