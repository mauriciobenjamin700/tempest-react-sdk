import { useState } from "react";
import { Checkbox, Radio, RadioGroup, Switch } from "tempest-react-sdk";
import { Example } from "../Example";

export function FormPrimitivesSection() {
    const [terms, setTerms] = useState(false);
    const [notify, setNotify] = useState(true);
    const [plan, setPlan] = useState("pro");

    return (
        <section className="gallery-section" id="form-primitives">
            <h3>Checkbox · Radio · Switch</h3>
            <p className="description">
                Inputs binários acessíveis. Tudo via teclado, com tokens CSS pra cor.
            </p>

            <Example
                title="Checkbox"
                note="Suporta description, defaultChecked, indeterminate e disabled."
                code={`<Checkbox
    label="Concordo com os termos de uso"
    description="Você pode revisar a qualquer momento na página de conta."
    checked={terms}
    onChange={(event) => setTerms(event.target.checked)}
/>
<Checkbox label="Marketing por email" defaultChecked />
<Checkbox label="Indeterminado (mix de subitens)" indeterminate />
<Checkbox label="Desabilitado" disabled />`}
            >
                <div className="gallery-stack">
                    <Checkbox
                        label="Concordo com os termos de uso"
                        description="Você pode revisar a qualquer momento na página de conta."
                        checked={terms}
                        onChange={(event) => setTerms(event.target.checked)}
                    />
                    <Checkbox label="Marketing por email" defaultChecked />
                    <Checkbox label="Indeterminado (mix de subitens)" indeterminate />
                    <Checkbox label="Desabilitado" disabled />
                </div>
            </Example>

            <Example
                title="RadioGroup"
                note="Seleção única com descrição por opção."
                code={`<RadioGroup value={plan} onChange={setPlan}>
    <Radio value="free" label="Free" description="Para uso pessoal." />
    <Radio value="pro" label="Pro" description="Recursos completos + push." />
    <Radio value="team" label="Team" description="Multiusuário + SSO." />
</RadioGroup>`}
            >
                <div className="gallery-stack">
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>Plano</div>
                    <RadioGroup value={plan} onChange={setPlan}>
                        <Radio value="free" label="Free" description="Para uso pessoal." />
                        <Radio value="pro" label="Pro" description="Recursos completos + push." />
                        <Radio value="team" label="Team" description="Multiusuário + SSO." />
                    </RadioGroup>
                </div>
            </Example>

            <Example
                title="Switch"
                note="Toggle controlado — o label reflete o estado."
                code={`<Switch
    label={\`Notificações \${notify ? "(ativas)" : "(desativadas)"}\`}
    checked={notify}
    onChange={(event) => setNotify(event.target.checked)}
/>`}
            >
                <div className="gallery-stack">
                    <Switch
                        label={`Notificações ${notify ? "(ativas)" : "(desativadas)"}`}
                        checked={notify}
                        onChange={(event) => setNotify(event.target.checked)}
                    />
                </div>
            </Example>
        </section>
    );
}
