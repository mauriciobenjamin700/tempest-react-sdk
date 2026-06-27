import { useState } from "react";
import {
    Badge,
    Button,
    CEPInput,
    CNPJInput,
    CPFInput,
    Card,
    Input,
    MoneyInput,
    PhoneInput,
    Stack,
    useViaCEP,
    validateCNPJ,
    validateCPF,
} from "tempest-react-sdk";
import { Example } from "../Example";

export function BRFormsSection() {
    const [cpf, setCpf] = useState("");
    const [cnpj, setCnpj] = useState("");
    const [phone, setPhone] = useState("");
    const [cep, setCep] = useState("");
    const [money, setMoney] = useState<number>(0);
    const [street, setStreet] = useState("");
    const [city, setCity] = useState("");
    const [uf, setUf] = useState("");

    const cpfValid = cpf ? validateCPF(cpf) : null;
    const cnpjValid = cnpj ? validateCNPJ(cnpj) : null;
    const viaCEP = useViaCEP();

    async function lookupCEP(): Promise<void> {
        const result = await viaCEP.lookup(cep);
        if (result) {
            setStreet(result.logradouro);
            setCity(result.localidade);
            setUf(result.uf);
        }
    }

    return (
        <section className="gallery-section" id="br-forms">
            <h3>Forms BR — máscaras + validadores</h3>
            <p className="description">
                Inputs com máscara controlada, algoritmo real de CPF/CNPJ, autocomplete via ViaCEP.
            </p>

            <Example
                title="Documentos com máscara + validação"
                note="CPF/CNPJ rodam o algoritmo real; o badge reflete a validade ao digitar."
                code={`const [cpf, setCpf] = useState("");
const cpfValid = cpf ? validateCPF(cpf) : null;

<Card title="Documentos">
    <Stack gap={3} style={{ maxWidth: 420 }}>
        <div>
            <CPFInput value={cpf} onChange={setCpf} label="CPF" placeholder="000.000.000-00" />
            {cpf && (
                <Badge variant={cpfValid ? "success" : "danger"} style={{ marginTop: 6 }}>
                    {cpfValid ? "Válido" : "Inválido"}
                </Badge>
            )}
        </div>
        <div>
            <CNPJInput value={cnpj} onChange={setCnpj} label="CNPJ" placeholder="00.000.000/0000-00" />
            {cnpj && (
                <Badge variant={cnpjValid ? "success" : "danger"} style={{ marginTop: 6 }}>
                    {cnpjValid ? "Válido" : "Inválido"}
                </Badge>
            )}
        </div>
        <PhoneInput value={phone} onChange={setPhone} label="Telefone" placeholder="(11) 98765-4321" />
        <MoneyInput value={money} onChange={setMoney} label="Valor (BRL)" />
        <p style={{ fontSize: 12, color: "var(--tempest-text-muted)" }}>
            Armazenado em centavos: <code>{money}</code>
        </p>
    </Stack>
</Card>`}
            >
                <Card title="Documentos">
                    <Stack gap={3} style={{ maxWidth: 420 }}>
                        <div>
                            <CPFInput
                                value={cpf}
                                onChange={setCpf}
                                label="CPF"
                                placeholder="000.000.000-00"
                            />
                            {cpf && (
                                <Badge
                                    variant={cpfValid ? "success" : "danger"}
                                    style={{ marginTop: 6 }}
                                >
                                    {cpfValid ? "Válido" : "Inválido"}
                                </Badge>
                            )}
                        </div>
                        <div>
                            <CNPJInput
                                value={cnpj}
                                onChange={setCnpj}
                                label="CNPJ"
                                placeholder="00.000.000/0000-00"
                            />
                            {cnpj && (
                                <Badge
                                    variant={cnpjValid ? "success" : "danger"}
                                    style={{ marginTop: 6 }}
                                >
                                    {cnpjValid ? "Válido" : "Inválido"}
                                </Badge>
                            )}
                        </div>
                        <PhoneInput
                            value={phone}
                            onChange={setPhone}
                            label="Telefone"
                            placeholder="(11) 98765-4321"
                        />
                        <MoneyInput value={money} onChange={setMoney} label="Valor (BRL)" />
                        <p style={{ fontSize: 12, color: "var(--tempest-text-muted)" }}>
                            Armazenado em centavos: <code>{money}</code>
                        </p>
                    </Stack>
                </Card>
            </Example>

            <Example
                title="CEP + autocomplete via ViaCEP"
                note="Digite um CEP e clique em Buscar pra preencher logradouro, cidade e UF."
                code={`const viaCEP = useViaCEP();

async function lookupCEP(): Promise<void> {
    const result = await viaCEP.lookup(cep);
    if (result) {
        setStreet(result.logradouro);
        setCity(result.localidade);
        setUf(result.uf);
    }
}

<Card title="CEP + ViaCEP">
    <Stack gap={3} style={{ maxWidth: 420 }}>
        <Stack direction="horizontal" gap={2} align="end">
            <CEPInput value={cep} onChange={setCep} label="CEP" placeholder="00000-000" wrapperClassName="cep" />
            <Button loading={viaCEP.loading} onClick={lookupCEP}>
                Buscar
            </Button>
        </Stack>
        {viaCEP.error && <Badge variant="danger">{viaCEP.error}</Badge>}
        <Input label="Logradouro" value={street} onChange={(e) => setStreet(e.target.value)} />
        <Stack direction="horizontal" gap={2}>
            <Input label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input label="UF" value={uf} onChange={(e) => setUf(e.target.value)} />
        </Stack>
    </Stack>
</Card>`}
            >
                <Card title="CEP + ViaCEP">
                    <Stack gap={3} style={{ maxWidth: 420 }}>
                        <Stack direction="horizontal" gap={2} align="end">
                            <CEPInput
                                value={cep}
                                onChange={setCep}
                                label="CEP"
                                placeholder="00000-000"
                                wrapperClassName="cep"
                            />
                            <Button loading={viaCEP.loading} onClick={lookupCEP}>
                                Buscar
                            </Button>
                        </Stack>
                        {viaCEP.error && <Badge variant="danger">{viaCEP.error}</Badge>}
                        <Input
                            label="Logradouro"
                            value={street}
                            onChange={(e) => setStreet(e.target.value)}
                        />
                        <Stack direction="horizontal" gap={2}>
                            <Input
                                label="Cidade"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                            />
                            <Input label="UF" value={uf} onChange={(e) => setUf(e.target.value)} />
                        </Stack>
                    </Stack>
                </Card>
            </Example>
        </section>
    );
}
