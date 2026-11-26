# Desempenho de interações: etapas, CPU e bateria

Quando alguém diz *"o app esquenta o celular"* ou *"travou no checkout"*, você
precisa de três respostas: **quanto tempo cada etapa levou**, **quanto a CPU
trabalhou** e **quanto de bateria aquilo custou**. O `createPerfMonitor` junta as
três no mesmo relatório, do mesmo jeito em desenvolvimento e em produção. 🔋

!!! info "O que o navegador deixa medir"
    Nenhuma API web expõe joules, tempo de CPU ou FLOPs. O monitor usa o que
    **existe** e devolve `null` para o resto — nunca um número inventado.

| Medida | De onde vem | Chrome/Android | Safari/iOS | Firefox |
| --- | --- | --- | --- | --- |
| Tempo por etapa | `performance.now()` | ✅ | ✅ | ✅ |
| Main thread travada | `long-animation-frame` (ou `longtask`) | ✅ | — | — |
| Pressão de CPU | Compute Pressure (`PressureObserver`) | ✅ | — | — |
| Latência do toque | Event Timing (`event`) | ✅ | ✅ | ✅ |
| Bateria | Battery Status (`getBattery`) | ✅ | — | — |

Sondado no Chromium 159 com Playwright (`PerformanceObserver.supportedEntryTypes`,
`typeof navigator.getBattery`, `typeof PressureObserver`) em 26/11/2026.

## 1. Crie um monitor, uma vez

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

export const perf = createPerfMonitor();
```

Crie **fora do React, na inicialização do app**. Os observers só enxergam o que
acontece depois de existirem (mais o pequeno buffer que o navegador guarda), e um
monitor recriado a cada render perde o histórico.

## 2. Meça uma interação, etapa por etapa

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

async function finalizarCompra(): Promise<void> {
    const trace = perf.trace("checkout");

    trace.spanSync("validar", () => true);

    await trace.span("pagar", async (etapa) => {
        await etapa.span("tokenizar", async () => "tok_123");
        await etapa.span("cobrar", async () => "ok");
    });

    const report = await trace.end();
    console.log(report.spans);
    // [
    //   { path: "validar",          depth: 0, startMs: 0,   durationMs: 3,   longFrameMs: 0 },
    //   { path: "pagar",            depth: 0, startMs: 3,   durationMs: 410, longFrameMs: 0 },
    //   { path: "pagar/tokenizar",  depth: 1, startMs: 3,   durationMs: 160, longFrameMs: 0 },
    //   { path: "pagar/cobrar",     depth: 1, startMs: 163, durationMs: 250, longFrameMs: 0 },
    // ]
}
```

| Método | Para |
| --- | --- |
| `span(nome, fn)` | Etapa assíncrona. `fn` recebe um escopo para sub-etapas |
| `spanSync(nome, fn)` | Etapa síncrona, idem |
| `mark(nome, ms)` | Duração medida em outro lugar (`Server-Timing`, `speed` do `/vision`), posicionada terminando agora |
| `end()` | Fecha e devolve o relatório. Chamar de novo devolve o mesmo |

Uma etapa que lança é registrada com `failed: true` e o erro **segue** para quem
chamou. O relatório inteiro fica `failed: true`.

!!! tip "Comece o trace dentro do handler"
    `perf.trace()` chamado dentro do `onClick` pareia o relatório com o gesto que o
    disparou: `report.input` traz atraso de input, tempo de handler e tempo até a
    pintura. Fora de um handler (polling, timer), `input` fica `null`.

## 3. O custo computacional

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

async function processar(): Promise<void> {
    const trace = perf.trace("relatorio");
    await trace.span("montar", async () => [1, 2, 3].map((n) => n * 2));
    const { cpu, spans } = await trace.end();

    console.log(cpu.longFrameMs); // 240   — ms em que a tela não respondia
    console.log(cpu.longFrames); // 3      — quantos frames ≥ 50 ms
    console.log(cpu.peakPressure); // "serious" — pior estado de CPU no período
    console.log(spans[0]?.longFrameMs); // a fatia que cabe a esta etapa
}
```

- **`longFrameMs`** soma os frames longos (≥ 50 ms) que **sobrepõem** a etapa,
  contando só a parte sobreposta. É o custo que o usuário sente como tela
  congelada. Trabalho num Worker ou nas threads WASM do onnxruntime **não**
  entra — de propósito: ali a tela continua respondendo.
- **`peakPressure`** é o pior estado de CPU (`nominal` → `fair` → `serious` →
  `critical`) visto durante o trace, incluindo o que já valia quando ele começou.
  `serious` e `critical` significam que o aparelho está desacelerando o trabalho
  — é a hora de um pipeline pesado recuar.

!!! warning "Pressure precisa de contexto seguro"
    `PressureObserver.observe()` recusa em HTTP e dentro de iframe de outra origem
    (política `compute-pressure`). O monitor engole a recusa e deixa `pressure` em
    `null`, em vez de lançar.

## 4. Bateria: taxa de descarga, não custo por clique

```typescript
import { createPerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

perf.subscribe(() => {
    const battery = perf.getSnapshot().battery;
    if (battery && battery.drainPerHour !== null) {
        console.log(`${battery.drainPerHour.toFixed(1)} %/h`);
    }
});
```

O navegador entrega o nível em **degraus de 1 %**. Uma interação de segundos
nunca move o ponteiro sozinha, então o monitor mede o que dá para medir com
honestidade: a **taxa de descarga da sessão**, em pontos percentuais por hora.

- A taxa é medida **de degrau a degrau** (entre duas mudanças de nível), nunca de
  um instante qualquer: assim o arredondamento de 1 % não distorce a conta.
- Fica `null` até o segundo degrau na bateria, e zera a cada vez que o aparelho
  é ligado ou desligado da tomada.
- `report.battery.start` / `.end` registram o nível no começo e no fim de cada
  trace, para cruzar com a taxa depois.

!!! tip "Comparar, não medir no absoluto"
    Use a taxa para **comparar**: build nova × build anterior, recurso pesado
    ligado × desligado, na mesma sessão de teste e com a tela no mesmo brilho.
    Para joules por interação, perfile no próprio aparelho: Perfetto /
    `adb shell dumpsys batterystats` no Android.

## 5. Em desenvolvimento: DevTools e `<PerfHud>`

Toda etapa vira um `performance.measure()` numa trilha **"Tempest"** do painel
Performance do Chrome DevTools, uma faixa por interação. Grave um perfil, clique,
e as etapas aparecem alinhadas com os frames e as tarefas da main thread.
`createPerfMonitor({ devtools: false })` desliga.

O [`<PerfHud>`](components/feedback.md#perfhud) mostra o mesmo monitor ao vivo,
por cima do app:

```tsx
import { PerfHud, createPerfMonitor, usePerfMonitor } from "tempest-react-sdk";

const perf = createPerfMonitor();

export function DevOverlay() {
    const snapshot = usePerfMonitor(perf);
    return import.meta.env.DEV ? <PerfHud snapshot={snapshot} /> : null;
}
```

## 6. Em produção: amostragem e telemetria

```typescript
import { consoleTelemetryAdapter, createPerfMonitor, perfReportToEvent } from "tempest-react-sdk";

export const perf = createPerfMonitor({
    sampleRate: import.meta.env.PROD ? 0.1 : 1,
    onReport: (report) => consoleTelemetryAdapter.track(perfReportToEvent(report)),
});
```

- `sampleRate` decide que fração dos relatórios vai para o `onReport` (o
  snapshot local recebe todos). Cada relatório é um evento de telemetria — em
  produção, 10 % costuma bastar.
- `perfReportToEvent` achata o relatório num `TelemetryEvent` com propriedades
  planas (`totalMs`, `longFrameMs`, `peakPressure`, `batteryLevel`,
  `inputDelayMs`, `span.pagar/cobrar.ms`…), o formato que PostHog, Amplitude e
  tags do Sentry filtram e plotam. Valores retidos pelo navegador ficam `null`,
  nunca `0` — senão o Safari pareceria infinitamente rápido.

## Opções

| Opção | Tipo | Default | Para |
| --- | --- | --- | --- |
| `onReport` | `(report) => void` | — | Recebe os relatórios sorteados |
| `sampleRate` | `number` (`[0, 1]`) | `1` | Fração enviada ao `onReport` |
| `devtools` | `boolean` | `true` | Trilha "Tempest" no DevTools |
| `historySize` | `number` | `20` | Relatórios e gestos guardados no snapshot |
| `pressureIntervalMs` | `number` | `1000` | Período de amostragem da pressão de CPU |

## Recap

- `createPerfMonitor()` uma vez → `trace(nome)` → `span` / `spanSync` / `mark` →
  `end()`. ✅
- Tempo por etapa em todo navegador; main thread travada, pressão de CPU e
  bateria no Chromium; o resto vem `null`.
- Bateria é taxa de descarga da sessão (%/h), medida de degrau a degrau — não
  custo por clique.
- Dev: trilha "Tempest" no DevTools + `<PerfHud>`. Produção: `sampleRate` +
  `perfReportToEvent` para a telemetria.
- Para custo de inferência on-device (tamanho de modelo, `speed` do `/vision`),
  veja o [módulo `perf`](perf.md).
