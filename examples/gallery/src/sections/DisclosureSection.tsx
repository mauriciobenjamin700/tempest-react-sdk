import { Accordion, Collapsible, ScrollArea } from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * Componentes de divulgação progressiva: acordeão, bloco colapsável e área de
 * rolagem com altura limitada.
 */
export function DisclosureSection() {
    return (
        <section className="gallery-section" id="disclosure">
            <h3>Accordion · Collapsible · ScrollArea</h3>
            <p className="description">
                Mostre conteúdo sob demanda — expandir/recolher e rolagem contida.
            </p>

            <Example
                title="Accordion"
                note="Vários painéis; abra um por vez (ou use multiple)."
                code={`<Accordion
  defaultValue={["a"]}
  items={[
    { id: "a", title: "O que é o SDK?", children: "Componentes React reutilizáveis." },
    { id: "b", title: "Como instalar?", children: "npm install tempest-react-sdk" },
    { id: "c", title: "Tem tema escuro?", children: 'Sim, via data-tempest-theme="dark".' },
  ]}
/>`}
            >
                <Accordion
                    defaultValue={["a"]}
                    items={[
                        {
                            id: "a",
                            title: "O que é o SDK?",
                            children: "Componentes React reutilizáveis.",
                        },
                        {
                            id: "b",
                            title: "Como instalar?",
                            children: "npm install tempest-react-sdk",
                        },
                        {
                            id: "c",
                            title: "Tem tema escuro?",
                            children: 'Sim, via data-tempest-theme="dark".',
                        },
                    ]}
                />
            </Example>

            <Example
                title="Collapsible"
                note="Um único bloco expansível, controlado pelo gatilho."
                code={`<Collapsible trigger="Detalhes técnicos" defaultOpen>
  <p>Construído com Vite, TypeScript e CSS Modules.</p>
</Collapsible>`}
            >
                <Collapsible trigger="Detalhes técnicos" defaultOpen>
                    <p>Construído com Vite, TypeScript e CSS Modules.</p>
                </Collapsible>
            </Example>

            <Example
                title="ScrollArea"
                note="Conteúdo alto contido numa altura máxima rolável."
                code={`<ScrollArea maxHeight={160}>
  {Array.from({ length: 20 }, (_, i) => (
    <p key={i}>Linha {i + 1}</p>
  ))}
</ScrollArea>`}
            >
                <ScrollArea maxHeight={160}>
                    {Array.from({ length: 20 }, (_, i) => (
                        <p key={i}>Linha {i + 1}</p>
                    ))}
                </ScrollArea>
            </Example>
        </section>
    );
}
