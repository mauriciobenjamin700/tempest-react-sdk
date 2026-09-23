import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
    ALL_OPTION_VALUE,
    Input,
    ListTile,
    SearchBar,
    Select,
    Textarea,
    toOptions,
    withAllOption,
    withEmptyOption,
} from "tempest-react-sdk";
import { Example } from "../Example";

const STATUS = { active: "Ativo", paused: "Pausado", archived: "Arquivado" };
const HUMOR = new Map([
    [5, "Ótimo"],
    [3, "Ok"],
    [1, "Ruim"],
]);

export function FormFieldsSection() {
    const [email, setEmail] = useState("");
    const [search, setSearch] = useState("");
    const [bio, setBio] = useState("");
    const [country, setCountry] = useState("");
    const [lang, setLang] = useState("pt");
    const [status, setStatus] = useState(ALL_OPTION_VALUE);
    const [humor, setHumor] = useState("");

    const emailError =
        email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Email inválido." : undefined;

    return (
        <section className="gallery-section" id="form-fields">
            <h3>Form fields</h3>
            <p className="description">
                Inputs com label, helper text e estado de erro. Forward ref pra integrar com{" "}
                <code>react-hook-form</code>.
            </p>

            <Example
                title="Input com validação"
                note="Helper text vira mensagem de erro quando o email é inválido."
                code={`<Input
    label="Email"
    type="email"
    placeholder="voce@dominio.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    helperText="Usaremos isso pra login."
    error={emailError}
    required
/>`}
            >
                <div className="gallery-stack">
                    <Input
                        label="Email"
                        type="email"
                        placeholder="voce@dominio.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        helperText="Usaremos isso pra login."
                        error={emailError}
                        required
                    />
                </div>
            </Example>

            <Example
                title="Select — variante chip numa linha de configurações"
                note='variant="chip" renderiza só o controle, sem label nem slot de erro. aria-label é obrigatório, porque o nome visível é o da linha.'
                code={`<ListTile
  leading={<span>🌐</span>}
  title="Idioma"
  trailing={
      <Select
          variant="chip"
          aria-label="Idioma"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          options={[
              { value: "pt", label: "Português" },
              { value: "en", label: "English" },
          ]}
      />
  }
/>`}
            >
                <div
                    style={{
                        width: 320,
                        border: "1px solid var(--tempest-border)",
                        borderRadius: 8,
                    }}
                >
                    <ListTile
                        leading={<span>🌐</span>}
                        title="Idioma"
                        trailing={
                            <Select
                                variant="chip"
                                aria-label="Idioma"
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                options={[
                                    { value: "pt", label: "Português" },
                                    { value: "en", label: "English" },
                                ]}
                            />
                        }
                    />
                    <ListTile
                        leading={<span>🔔</span>}
                        title="Notificações"
                        trailing={
                            <Select
                                variant="chip"
                                aria-label="Notificações"
                                defaultValue="all"
                                options={[
                                    { value: "all", label: "Todas" },
                                    { value: "none", label: "Nenhuma" },
                                ]}
                            />
                        }
                    />
                </div>
            </Example>

            <Example
                title="Select — variante bare com a vestimenta do app"
                note='variant="bare" entrega appearance: none, caret e anel de foco, sem borda, fundo, raio, sombra nem altura. A casca (wrapperClassName) é o item flex e veste; o select herda fundo e cor. A barra tem uma regra ".gallery-filter-bar svg" de app que não captura o caret.'
                code={`const STATUS = { active: "Ativo", paused: "Pausado", archived: "Arquivado" };
const HUMOR = new Map([[5, "Ótimo"], [3, "Ok"], [1, "Ruim"]]);

<div className="gallery-filter-bar">
    <Select
        variant="bare"
        aria-label="Status"
        wrapperClassName="gallery-brand-select"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={withAllOption(toOptions(STATUS))}
    />
    <Select
        variant="bare"
        aria-label="Humor"
        wrapperClassName="gallery-light-select"
        caretIcon={<ChevronsUpDown />}
        value={humor}
        onChange={(e) => setHumor(e.target.value)}
        options={withEmptyOption(toOptions(HUMOR))}
    />
</div>`}
            >
                <div className="gallery-filter-bar">
                    <Select
                        variant="bare"
                        aria-label="Status"
                        wrapperClassName="gallery-brand-select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        options={withAllOption(toOptions(STATUS))}
                    />
                    <Select
                        variant="bare"
                        aria-label="Humor"
                        wrapperClassName="gallery-light-select"
                        caretIcon={<ChevronsUpDown />}
                        value={humor}
                        onChange={(e) => setHumor(e.target.value)}
                        options={withEmptyOption(toOptions(HUMOR))}
                    />
                </div>
            </Example>

            <Example
                title="Select e Textarea"
                note="Textarea com contador de caracteres no helper text."
                code={`<Select
    label="País"
    placeholder="Selecione…"
    value={country}
    onChange={(e) => setCountry(e.target.value)}
    options={[
        { value: "BR", label: "Brasil" },
        { value: "PT", label: "Portugal" },
        { value: "US", label: "Estados Unidos" },
    ]}
/>
<Textarea
    label="Bio"
    placeholder="Conte um pouco sobre você…"
    value={bio}
    onChange={(e) => setBio(e.target.value)}
    helperText={\`\${bio.length}/280\`}
/>`}
            >
                <div className="gallery-stack">
                    <Select
                        label="País"
                        placeholder="Selecione…"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        options={[
                            { value: "BR", label: "Brasil" },
                            { value: "PT", label: "Portugal" },
                            { value: "US", label: "Estados Unidos" },
                        ]}
                    />
                    <Textarea
                        label="Bio"
                        placeholder="Conte um pouco sobre você…"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        helperText={`${bio.length}/280`}
                    />
                </div>
            </Example>

            <Example
                title="SearchBar"
                note="onChange recebe o valor direto (sem event)."
                code={`<SearchBar value={search} onChange={setSearch} placeholder="Buscar usuários…" />`}
            >
                <div className="gallery-stack">
                    <SearchBar value={search} onChange={setSearch} placeholder="Buscar usuários…" />
                </div>
            </Example>
        </section>
    );
}
