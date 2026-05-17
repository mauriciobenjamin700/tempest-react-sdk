import { useState } from "react";
import { Input, SearchBar, Select, Textarea } from "tempest-react-sdk";

export function FormFieldsSection() {
    const [email, setEmail] = useState("");
    const [search, setSearch] = useState("");
    const [bio, setBio] = useState("");
    const [country, setCountry] = useState("");

    const emailError =
        email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Email inválido." : undefined;

    return (
        <section className="gallery-section" id="form-fields">
            <h3>Form fields</h3>
            <p className="description">
                Inputs com label, helper text e estado de erro. Forward ref pra integrar com{" "}
                <code>react-hook-form</code>.
            </p>

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
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar usuários…"
                />
            </div>
        </section>
    );
}
