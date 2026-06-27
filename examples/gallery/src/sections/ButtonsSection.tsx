import { Button } from "tempest-react-sdk";
import { useState } from "react";
import { Example } from "../Example";

export function ButtonsSection() {
    const [loading, setLoading] = useState(false);

    function simulateLoad(): void {
        setLoading(true);
        setTimeout(() => setLoading(false), 1500);
    }

    return (
        <section className="gallery-section" id="buttons">
            <h3>Buttons</h3>
            <p className="description">
                Variantes <code>primary</code> / <code>secondary</code> / <code>danger</code> /{" "}
                <code>ghost</code>, três tamanhos, estado de loading com spinner absoluto (não
                desloca o layout).
            </p>

            <Example
                title="Variantes"
                note="primary · secondary · danger · ghost · disabled"
                code={`<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="danger">Danger</Button>
<Button variant="ghost">Ghost</Button>
<Button disabled>Disabled</Button>`}
            >
                <div className="gallery-row">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="danger">Danger</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button disabled>Disabled</Button>
                </div>
            </Example>

            <Example
                title="Tamanhos e loading"
                note="O spinner é absoluto — o botão não muda de largura."
                code={`<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
<Button loading={loading} onClick={simulateLoad}>
    {loading ? "Salvando…" : "Simular ação"}
</Button>`}
            >
                <div className="gallery-row">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                    <Button loading={loading} onClick={simulateLoad}>
                        {loading ? "Salvando…" : "Simular ação"}
                    </Button>
                </div>
            </Example>

            <Example title="Largura total" code={`<Button fullWidth>Full width</Button>`}>
                <div className="gallery-row">
                    <Button fullWidth>Full width</Button>
                </div>
            </Example>
        </section>
    );
}
