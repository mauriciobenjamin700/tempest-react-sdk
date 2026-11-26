import { useState } from "react";
import { Button, PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";
import type { PerfSnapshot } from "tempest-react-sdk";
import { Example } from "../Example";

const perf = createPerfMonitor();

const DEVICE = { hardwareConcurrency: 8, deviceMemoryGb: 4, jsHeapUsedMb: null };

/**
 * A snapshot recorded from this section's own buttons on Chromium 159 (two
 * checkouts, the second one refused), frozen so the documentation capture
 * shows a full waterfall and does not change between runs the way live
 * timings, CPU pressure and battery do.
 */
const RECORDED: PerfSnapshot = {
    battery: { level: 1, charging: true, at: 0, drainPerHour: null },
    pressure: "serious",
    inputs: [
        {
            interactionId: 2,
            type: "click",
            startTime: 4100,
            inputDelayMs: 18,
            processingMs: 120,
            presentationMs: 22,
            durationMs: 160,
        },
    ],
    reports: [
        {
            name: "checkout",
            startTime: 4100,
            totalMs: 437,
            spans: [
                {
                    name: "validate",
                    path: "validate",
                    depth: 0,
                    startMs: 0,
                    durationMs: 120,
                    longFrameMs: 120,
                    failed: false,
                },
                {
                    name: "pay",
                    path: "pay",
                    depth: 0,
                    startMs: 121,
                    durationMs: 253,
                    longFrameMs: 0,
                    failed: true,
                },
                {
                    name: "tokenize",
                    path: "pay/tokenize",
                    depth: 1,
                    startMs: 121,
                    durationMs: 97,
                    longFrameMs: 0,
                    failed: false,
                },
                {
                    name: "charge",
                    path: "pay/charge",
                    depth: 1,
                    startMs: 218,
                    durationMs: 156,
                    longFrameMs: 0,
                    failed: true,
                },
                {
                    name: "rollback",
                    path: "rollback",
                    depth: 0,
                    startMs: 375,
                    durationMs: 62,
                    longFrameMs: 0,
                    failed: false,
                },
            ],
            cpu: { longFrameMs: 133, longFrames: 1, peakPressure: "serious" },
            battery: { start: null, end: null },
            input: null,
            device: DEVICE,
            failed: true,
            measuredAt: 0,
        },
        {
            name: "checkout",
            startTime: 1200,
            totalMs: 373,
            spans: [
                {
                    name: "validate",
                    path: "validate",
                    depth: 0,
                    startMs: 0,
                    durationMs: 120,
                    longFrameMs: 120,
                    failed: false,
                },
                {
                    name: "pay",
                    path: "pay",
                    depth: 0,
                    startMs: 121,
                    durationMs: 253,
                    longFrameMs: 0,
                    failed: false,
                },
                {
                    name: "tokenize",
                    path: "pay/tokenize",
                    depth: 1,
                    startMs: 121,
                    durationMs: 81,
                    longFrameMs: 0,
                    failed: false,
                },
                {
                    name: "charge",
                    path: "pay/charge",
                    depth: 1,
                    startMs: 202,
                    durationMs: 171,
                    longFrameMs: 0,
                    failed: false,
                },
            ],
            cpu: { longFrameMs: 131, longFrames: 1, peakPressure: "serious" },
            battery: { start: null, end: null },
            input: null,
            device: DEVICE,
            failed: false,
            measuredAt: 0,
        },
    ],
    support: {
        battery: true,
        pressure: true,
        longFrames: "long-animation-frame",
        eventTiming: true,
    },
};

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
                id="perf-hud-recorded"
                title="PerfHud com um relatório gravado"
                note="Snapshot fixo, gravado dos botões abaixo no Chromium 159: dois checkouts, o segundo recusado. A validação de 120 ms aparece como frame longo; a cobrança recusada pinta a etapa e o pai de vermelho."
                code={`import { PerfHud } from "tempest-react-sdk";
import type { PerfSnapshot } from "tempest-react-sdk";

<PerfHud snapshot={gravado} position="inline" defaultOpen />`}
            >
                <PerfHud snapshot={RECORDED} position="inline" defaultOpen />
            </Example>
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
