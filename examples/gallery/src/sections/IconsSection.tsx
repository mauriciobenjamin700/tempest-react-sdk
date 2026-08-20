import { useMemo, useState } from "react";
import { Badge, Button, Input } from "tempest-react-sdk";
import { Icon, IconPicker, iconNames, preloadIcons } from "tempest-react-sdk/icons";
import { Example } from "../Example";

/** Icons rendered as literals, so the plugin's static path is exercised too. */
const LITERAL = ["save", "trash-2", "circle-alert", "house", "search", "settings"] as const;

/** A menu built from data, the case that used to force `DynamicIcon`. */
const MENU = [
    { name: "layout-dashboard", label: "Dashboard" },
    { name: "users", label: "Usuários" },
    { name: "bar-chart-3", label: "Relatórios" },
    { name: "alert-circle", label: "Alertas (slug antigo)" },
];

const PAGE_SIZE = 120;

/**
 * Demo of icon-by-slug.
 *
 * The grid is the point: it renders slugs picked at runtime out of the full
 * ~2000-name list, and the network tab shows **one** request per initial letter
 * instead of one per icon — which is what makes `<Icon name>` usable where
 * `lucide-react`'s own `DynamicIcon` is not.
 */
export function IconsSection() {
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const [picked, setPicked] = useState("shopping-cart");

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? iconNames.filter((name) => name.includes(q)) : iconNames;
    }, [query]);

    const visible = matches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    return (
        <section className="gallery-section" id="icons">
            <h3>Ícones por slug — tempest-react-sdk/icons</h3>
            <p className="description">
                Os {iconNames.length} slugs do lucide endereçáveis por nome, sem o custo do{" "}
                <code>DynamicIcon</code> (que força ~2000 fronteiras de chunk). Slug literal resolve
                estático; slug de runtime carrega <strong>um</strong> shard da faixa dele.
            </p>

            <Example
                title="IconPicker"
                id="ex-icon-picker"
                note="Campo de ícone com autocomplete nativo, preview e validação: digite Shopping_Cart ou alert-circle e veja o slug canônico sair; digite um nome inexistente e o submit é barrado pelo browser."
                code={`const [icon, setIcon] = useState("");

<form onSubmit={save}>
    <IconPicker id="icon" value={icon} onChange={setIcon} required />
    <button type="submit">Salvar</button>
</form>`}
                props={[
                    { name: "value", type: "string", description: "O slug escolhido, canônico." },
                    {
                        name: "onChange",
                        type: "(slug: string) => void",
                        description:
                            "Dispara com o slug canônico — entrada legada (snake_case, maiúscula, alias) já normalizada.",
                    },
                    {
                        name: "limit",
                        type: "number",
                        default: "40",
                        description:
                            "Quantas sugestões renderizar. 2024 <option> a cada tecla travam o datalist.",
                    },
                    {
                        name: "previewSize",
                        type: "number",
                        default: "20",
                        description: "Tamanho do glifo de preview, em px.",
                    },
                    {
                        name: "invalidMessage",
                        type: "string",
                        description: "Sobrescreve a mensagem de slug inexistente.",
                    },
                ]}
            >
                <form
                    className="gallery-stack"
                    onSubmit={(event) => event.preventDefault()}
                    style={{ display: "grid", gap: 12, maxWidth: 420 }}
                >
                    <label htmlFor="gallery-icon-picker">Ícone da categoria</label>
                    <IconPicker
                        id="gallery-icon-picker"
                        value={picked}
                        onChange={setPicked}
                        required
                    />
                    <div className="gallery-toolbar">
                        <Button size="sm" type="submit">
                            Salvar
                        </Button>
                        <span>
                            Vai pro banco: <code>{picked || "—"}</code>
                        </span>
                    </div>
                </form>
            </Example>

            <Example
                title="Slug literal"
                code={`<Icon name="save" size={20} />`}
                note="Escrito no código. Com o plugin tempestIcons() no vite.config, custo zero de requisição."
            >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {LITERAL.map((name) => (
                        <span
                            key={name}
                            style={{ display: "grid", justifyItems: "center", gap: 4 }}
                        >
                            <Icon name={name} size={20} />
                            <code style={{ fontSize: 11 }}>{name}</code>
                        </span>
                    ))}
                </div>
            </Example>

            <Example
                title="Slug vindo de dados"
                code={`const MENU = [{ name: "layout-dashboard", label: "Dashboard" }, …];

MENU.map((item) => <Icon name={item.name} size={18} />)`}
                note="O caso que antes exigia DynamicIcon. `alert-circle` é um slug antigo do lucide e continua resolvendo — o mapa de 248 aliases aponta pro nome canônico."
            >
                <div style={{ display: "grid", gap: 8 }}>
                    {MENU.map((item) => (
                        <span
                            key={item.name}
                            style={{ display: "flex", alignItems: "center", gap: 8 }}
                        >
                            <Icon name={item.name} size={18} />
                            {item.label}
                        </span>
                    ))}
                </div>
            </Example>

            <Example
                title="Slug inexistente"
                code={`<Icon name="nao-existe" fallback={<Badge variant="danger">?</Badge>} />`}
                note="Nunca lança. Sem fallback renderiza nada; com fallback, o que você mandar. Em dev sai um console.warn uma vez por slug."
            >
                <Icon name="nao-existe" fallback={<Badge variant="danger">slug inválido</Badge>} />
            </Example>

            <Example
                title="Busca nos 1997 slugs"
                code={`import { iconNames, preloadIcons } from "tempest-react-sdk/icons";

const matches = iconNames.filter((name) => name.includes(query));`}
                note="Abra a aba de rede: um request por letra inicial, não por ícone. preloadIcons aquece os shards antes de você rolar."
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Input
                            placeholder="buscar slug…"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(0);
                            }}
                        />
                        <Button
                            variant="secondary"
                            onClick={() => void preloadIcons(visible.map((n) => n))}
                        >
                            Preload visíveis
                        </Button>
                    </div>

                    <p className="description">
                        {matches.length} de {iconNames.length} · mostrando {visible.length}
                    </p>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
                            gap: 12,
                        }}
                    >
                        {visible.map((name) => (
                            <span
                                key={name}
                                title={name}
                                style={{
                                    display: "grid",
                                    justifyItems: "center",
                                    gap: 4,
                                    padding: 8,
                                    border: "1px solid var(--tempest-color-border)",
                                    borderRadius: "var(--tempest-radius-md)",
                                }}
                            >
                                <Icon
                                    name={name}
                                    size={20}
                                    fallback={
                                        <span
                                            style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: 4,
                                                background: "var(--tempest-color-surface-2)",
                                            }}
                                        />
                                    }
                                />
                                <code
                                    style={{
                                        fontSize: 10,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "100%",
                                    }}
                                >
                                    {name}
                                </code>
                            </span>
                        ))}
                    </div>

                    {matches.length > PAGE_SIZE && (
                        <div style={{ display: "flex", gap: 8 }}>
                            <Button
                                variant="secondary"
                                disabled={page === 0}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="secondary"
                                disabled={(page + 1) * PAGE_SIZE >= matches.length}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Próxima
                            </Button>
                        </div>
                    )}
                </div>
            </Example>
        </section>
    );
}
