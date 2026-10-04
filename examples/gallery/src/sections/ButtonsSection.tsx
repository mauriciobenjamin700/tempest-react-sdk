import { Button, ButtonSlot } from "tempest-react-sdk";
import { useState } from "react";
import { Link, MemoryRouter, useLocation } from "react-router";
import { Example } from "../Example";

/** Mostra a rota atual do `MemoryRouter` da demo, para provar que o `Link` navegou sem reload. */
function CurrentRoute() {
    const location = useLocation();
    return (
        <span data-testid="buttons-route">
            rota: <code>{location.pathname}</code>
        </span>
    );
}

const VARIANTS = [
    "primary",
    "secondary",
    "danger",
    "success",
    "ghost",
    "soft",
    "outline",
    "link",
] as const;

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
                desloca o layout), e o botão que navega: <code>href</code> renderiza{" "}
                <code>&lt;a&gt;</code>, <code>ButtonSlot</code> estiliza um <code>Link</code>.
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

            <Example
                title="Botão que navega — href"
                note="Cada par: <button> à esquerda, <a href> à direita, mesma aparência. target=_blank recebe rel=noopener noreferrer."
                code={`<Button variant="outline">outline</Button>
<Button href="#buttons" variant="outline">outline</Button>
<Button href="https://wa.me/5586999999999" target="_blank">Fale conosco</Button>
<Button href="#buttons" size="sm" pill>Pill sm</Button>
<Button href="#buttons" disabled>Desabilitado</Button>
<Button href="#buttons" loading>Carregando</Button>`}
            >
                <div className="gallery-row" data-testid="buttons-href-pairs">
                    {VARIANTS.map((variant) => (
                        <span key={variant} className="gallery-row">
                            <Button variant={variant}>{variant}</Button>
                            <Button href="#buttons" variant={variant}>
                                {variant}
                            </Button>
                        </span>
                    ))}
                </div>
                <div className="gallery-row">
                    <Button href="https://wa.me/5586999999999" target="_blank">
                        Fale conosco
                    </Button>
                    <Button href="#buttons" size="sm" pill>
                        Pill sm
                    </Button>
                    <Button disabled>Desabilitado</Button>
                    <Button href="#buttons" disabled>
                        Desabilitado
                    </Button>
                    <Button href="#buttons" loading>
                        Carregando
                    </Button>
                </div>
            </Example>

            <Example
                title="Botão que navega — ButtonSlot + Link"
                note="O Link do react-router troca a rota sem recarregar a página; o SDK não importa o router."
                code={`<ButtonSlot variant="soft">
    <Link to="/planos">Ver planos</Link>
</ButtonSlot>`}
            >
                <MemoryRouter initialEntries={["/"]}>
                    <div className="gallery-row">
                        <ButtonSlot variant="soft">
                            <Link to="/planos">Ver planos</Link>
                        </ButtonSlot>
                        <ButtonSlot variant="outline">
                            <Link to="/">Início</Link>
                        </ButtonSlot>
                        <ButtonSlot disabled>
                            <Link to="/bloqueado">Desabilitado</Link>
                        </ButtonSlot>
                        <CurrentRoute />
                    </div>
                </MemoryRouter>
            </Example>
        </section>
    );
}
