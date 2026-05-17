import {
    formatCPF,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPercent,
    formatPhone,
} from "tempest-react-sdk";

export function UtilsSection() {
    const today = new Date();
    return (
        <section className="gallery-section" id="utils">
            <h3>Utils de formatação</h3>
            <p className="description">
                Helpers PT-BR via <code>Intl</code> + máscaras de documentos brasileiros.
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                    <tr>
                        <th style={cellStyle}>Helper</th>
                        <th style={cellStyle}>Entrada</th>
                        <th style={cellStyle}>Saída</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style={cellStyle}><code>formatCurrency(1234.5)</code></td>
                        <td style={cellStyle}>1234.5</td>
                        <td style={cellStyle}>{formatCurrency(1234.5)}</td>
                    </tr>
                    <tr>
                        <td style={cellStyle}><code>formatDate(today)</code></td>
                        <td style={cellStyle}>now</td>
                        <td style={cellStyle}>{formatDate(today)}</td>
                    </tr>
                    <tr>
                        <td style={cellStyle}><code>formatDateTime(today)</code></td>
                        <td style={cellStyle}>now</td>
                        <td style={cellStyle}>{formatDateTime(today)}</td>
                    </tr>
                    <tr>
                        <td style={cellStyle}><code>formatPhone("11987654321")</code></td>
                        <td style={cellStyle}>11987654321</td>
                        <td style={cellStyle}>{formatPhone("11987654321")}</td>
                    </tr>
                    <tr>
                        <td style={cellStyle}><code>formatCPF("12345678900")</code></td>
                        <td style={cellStyle}>12345678900</td>
                        <td style={cellStyle}>{formatCPF("12345678900")}</td>
                    </tr>
                    <tr>
                        <td style={cellStyle}><code>formatPercent(0.125)</code></td>
                        <td style={cellStyle}>0.125</td>
                        <td style={cellStyle}>{formatPercent(0.125)}</td>
                    </tr>
                </tbody>
            </table>
        </section>
    );
}

const cellStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid var(--tempest-border)",
    textAlign: "left",
};
