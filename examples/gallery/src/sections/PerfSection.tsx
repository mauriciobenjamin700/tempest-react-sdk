import { useState } from "react";
import { Button, PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";
import { Example } from "../Example";

const perf = createPerfMonitor();

/**
 * Block the main thread for `ms`, standing in for heavy synchronous work.
 *
 * @param ms How long to spin.
 * @returns A number so the loop is not optimised away.
 */
function busy(ms: number): number {
    const until = performance.now() + ms;
    let n = 0;
    while (performance.now() < until) n += 1;
    return n;
}

/**
 * Resolve after `ms`, standing in for a network call.
 *
 * @param ms Delay.
 * @returns A promise that resolves after the delay.
 */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demo of `createPerfMonitor` + `<PerfHud>`: every click runs a traced
 * "checkout" with a nested step, a synchronous step heavy enough to produce a
 * long animation frame, and an optional failure, so the HUD shows real
 * Event Timing, long-frame and battery numbers from this browser.
 */
export function PerfSection() {
    const snapshot = usePerfMonitor(perf);
    const [heavy, setHeavy] = useState<boolean>(true);
    const [floating, setFloating] = useState<boolean>(false);

    const run = async (fail: boolean): Promise<void> => {
        const trace = perf.trace("checkout");
        trace.spanSync("validate", () => busy(heavy ? 120 : 8));
        try {
            await trace.span("pay", async (step) => {
                await step.span("tokenize", () => wait(80));
                await step.span("charge", async () => {
                    await wait(150);
                    if (fail) throw new Error("recusado");
                });
            });
        } catch {
            await trace.span("rollback", () => wait(40));
        }
        await trace.end();
    };

    return (
        <section className="gallery-section" id="perf">
            <h3>Desempenho: etapas, CPU e bateria</h3>
            <Example
                id="perf-hud"
                title="createPerfMonitor + PerfHud"
                note="Cada clique é um trace real neste navegador. Abra o painel Performance do DevTools: as etapas aparecem na trilha “Tempest”. Bateria e pressão de CPU só existem no Chromium."
                code={`import { PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor({ sampleRate: import.meta.env.PROD ? 0.1 : 1 });

async function onCheckout() {
    const trace = perf.trace("checkout");
    trace.spanSync("validate", () => validate(form));
    await trace.span("pay", async (step) => {
        await step.span("tokenize", () => tokenize(card));
        await step.span("charge", () => charge(token));
    });
    await trace.end();
}

function DevOverlay() {
    return <PerfHud snapshot={usePerfMonitor(perf)} />;
}`}
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    <Button onClick={() => void run(false)}>Finalizar compra</Button>
                    <Button variant="secondary" onClick={() => void run(true)}>
                        Compra recusada
                    </Button>
                    <Button variant="ghost" onClick={() => setHeavy((h) => !h)}>
                        {heavy ? "Validação leve" : "Validação pesada (120 ms)"}
                    </Button>
                    <Button variant="ghost" onClick={() => setFloating((f) => !f)}>
                        {floating ? "HUD na página" : "HUD flutuante"}
                    </Button>
                </div>
                <PerfHud
                    snapshot={snapshot}
                    position={floating ? "bottom-right" : "inline"}
                    defaultOpen
                />
            </Example>
        </section>
    );
}
