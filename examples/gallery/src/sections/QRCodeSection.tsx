import { useState } from "react";
import { encodeQR, Input, QRCode, type QRErrorCorrection } from "tempest-react-sdk";
import { Example } from "../Example";

const LEVELS: QRErrorCorrection[] = ["L", "M", "Q", "H"];

const LEVEL_NOTE: Record<QRErrorCorrection, string> = {
    L: "~7% recuperável",
    M: "~15% recuperável",
    Q: "~25% recuperável",
    H: "~30% recuperável",
};

/**
 * Read back the version and mode the encoder settled on, for the caption.
 *
 * Returns `null` when the payload is too long for any symbol at that level —
 * the component throws in that case, which is right for an app and wrong for a
 * live playground where the user is mid-typing.
 */
function describe(
    value: string,
    level: QRErrorCorrection,
): { version: number; mode: string } | null {
    try {
        const matrix = encodeQR(value, { level });
        return { version: matrix.version, mode: matrix.mode };
    } catch {
        return null;
    }
}

/**
 * Demo of `QRCode`.
 *
 * The live field is the point of the section: typing changes the symbol's mode
 * and version as you go, which is how it becomes visible that digits-only
 * produces a much coarser — and therefore easier to scan — symbol than the same
 * content encoded as bytes.
 */
export function QRCodeSection() {
    const [value, setValue] = useState("https://tempest.dev");
    const [level, setLevel] = useState<QRErrorCorrection>("M");

    const safe = value.trim() === "" ? " " : value;
    const info = describe(safe, level);

    return (
        <>
            <Example
                id="qrcode-live"
                title="Ao vivo"
                note="Codificado no browser, sem dependência e sem ida a serviço de imagem."
                code={`import { QRCode } from "tempest-react-sdk";

<QRCode value="https://tempest.dev" />
<QRCode value={pixPayload} level="H" size={220} label="QR do Pix" />`}
                props={[
                    {
                        name: "value",
                        type: "string",
                        description: "O conteúdo. Vira UTF-8 quando não é dígito ou caixa alta.",
                    },
                    {
                        name: "size",
                        type: "number",
                        default: "160",
                        description: "Lado renderizado em px, zona de silêncio incluída.",
                    },
                    {
                        name: "level",
                        type: '"L" | "M" | "Q" | "H"',
                        default: '"M"',
                        description: "Nível de correção de erro.",
                    },
                    {
                        name: "margin",
                        type: "number",
                        default: "4",
                        description: "Zona de silêncio em módulos. Abaixo de 4, leitores erram.",
                    },
                    {
                        name: "color / background",
                        type: "string",
                        default: "#000000 / #ffffff",
                        description:
                            "Cores dos módulos e do fundo. Preto no branco nos dois temas, de propósito.",
                    },
                    {
                        name: "label",
                        type: "string",
                        default: "QR code: {value}",
                        description: "Nome acessível — leitor de tela não escaneia.",
                    },
                ]}
            >
                <div style={{ display: "grid", gap: "1rem", justifyItems: "start" }}>
                    <Input
                        label="Conteúdo"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder="https://…"
                        style={{ minWidth: "min(100%, 22rem)" }}
                    />
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {LEVELS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setLevel(option)}
                                aria-pressed={level === option}
                                style={{
                                    padding: "0.25rem 0.75rem",
                                    borderRadius: "var(--tempest-radius-md)",
                                    border: "1px solid var(--tempest-border)",
                                    background:
                                        level === option
                                            ? "var(--tempest-primary)"
                                            : "var(--tempest-bg)",
                                    color:
                                        level === option
                                            ? "var(--tempest-text-on-primary)"
                                            : "var(--tempest-text)",
                                    cursor: "pointer",
                                }}
                            >
                                {option}
                            </button>
                        ))}
                        <span style={{ alignSelf: "center", color: "var(--tempest-text-muted)" }}>
                            {LEVEL_NOTE[level]}
                        </span>
                    </div>

                    <QRCode value={safe} level={level} size={180} />

                    <p style={{ margin: 0, color: "var(--tempest-text-muted)" }}>
                        {info
                            ? `versão ${info.version} · modo ${info.mode} · nível ${level}`
                            : "conteúdo longo demais para um símbolo neste nível"}
                    </p>
                </div>
            </Example>

            <Example
                id="qrcode-levels"
                title="Níveis de correção"
                note="Mais correção = mais módulos no mesmo conteúdo. Vale quando o QR vai pra papel, adesivo ou vitrine."
                code={`{(["L", "M", "Q", "H"] as const).map((level) => (
  <QRCode key={level} value="https://tempest.dev/recibo/9931" level={level} size={120} />
))}`}
            >
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {LEVELS.map((option) => (
                        <figure key={option} style={{ margin: 0, textAlign: "center" }}>
                            <QRCode
                                value="https://tempest.dev/recibo/9931"
                                level={option}
                                size={120}
                            />
                            <figcaption
                                style={{
                                    fontSize: "0.8125rem",
                                    color: "var(--tempest-text-muted)",
                                    marginTop: "0.375rem",
                                }}
                            >
                                {option} · v
                                {
                                    encodeQR("https://tempest.dev/recibo/9931", { level: option })
                                        .version
                                }
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </Example>

            <Example
                id="qrcode-modes"
                title="O modo muda o tamanho"
                note="O mesmo número em dígitos puros cabe num símbolo bem menor que em bytes — 3 dígitos em 10 bits contra 8 bits por byte."
                code={`<QRCode value="5511987654321" />          {/* numérico */}
<QRCode value="PIX BR 2026 ABC-123" />     {/* alfanumérico */}
<QRCode value="pix br 2026 abc-123" />     {/* byte (caixa baixa) */}`}
            >
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {[
                        { text: "5511987654321", note: "numérico" },
                        { text: "PIX BR 2026 ABC-123", note: "alfanumérico" },
                        { text: "pix br 2026 abc-123", note: "byte (caixa baixa)" },
                    ].map((item) => (
                        <figure key={item.note} style={{ margin: 0, textAlign: "center" }}>
                            <QRCode value={item.text} size={120} />
                            <figcaption
                                style={{
                                    fontSize: "0.8125rem",
                                    color: "var(--tempest-text-muted)",
                                    marginTop: "0.375rem",
                                }}
                            >
                                {item.note} · v{encodeQR(item.text).version}
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </Example>
        </>
    );
}
