import { useMemo, useState } from "react";
import { Badge, Button, Scheduler, type SchedulerEvent } from "tempest-react-sdk";
import { Example } from "../Example";

/**
 * A fixed reference instant.
 *
 * Passed as `now` and `anchor` so the demo renders the same thing on every reload —
 * a visual difference then means the component changed, not the clock.
 */
const NOW = new Date(2026, 6, 27, 14, 20);

/** Monday of the demo week. */
const MONDAY = new Date(2026, 6, 27);

/** An event on `MONDAY + dayOffset`, local time. */
function at(
    id: string,
    title: string,
    dayOffset: number,
    from: [number, number],
    to: [number, number],
): SchedulerEvent {
    const d = MONDAY.getDate() + dayOffset;
    return {
        id,
        title,
        start: new Date(2026, 6, d, from[0], from[1]),
        end: new Date(2026, 6, d, to[0], to[1]),
    };
}

const WEEK: SchedulerEvent[] = [
    // Monday: three mutually overlapping events — the case that exercises clustering.
    at("1", "Daily", 0, [9, 0], [9, 15]),
    at("2", "Cliente Acme", 0, [9, 0], [10, 30]),
    at("3", "1:1 com Ana", 0, [9, 30], [10, 0]),
    // Tuesday: back-to-back, which must stay full width.
    at("4", "Planning", 1, [10, 0], [11, 0]),
    at("5", "Retro", 1, [11, 0], [12, 0]),
    // Wednesday: a column freed and reused.
    at("6", "Onboarding", 2, [9, 0], [10, 0]),
    at("7", "Suporte (plantão)", 2, [9, 0], [17, 0]),
    at("8", "Revisão de PR", 2, [10, 0], [11, 0]),
    // Thursday: crosses the end of the window.
    at("9", "Deploy janela noturna", 3, [19, 0], [23, 30]),
    {
        id: "10",
        title: "Feriado local",
        start: new Date(2026, 6, 31),
        end: new Date(2026, 7, 1),
        allDay: true,
    },
    {
        id: "11",
        title: "Viagem — conferência",
        start: new Date(2026, 6, 29),
        end: new Date(2026, 6, 31),
        allDay: true,
    },
];

/**
 * Demo of the agenda.
 *
 * Monday, Tuesday and Wednesday are seeded to show the three overlap outcomes side by
 * side: a three-way cluster, back-to-back events at full width, and a column being
 * reused once it frees.
 */
export function SchedulerSection() {
    const [selected, setSelected] = useState<SchedulerEvent | null>(null);
    const [created, setCreated] = useState<Date | null>(null);
    const [dayCount, setDayCount] = useState(7);

    const timeLabel = useMemo(
        () => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }),
        [],
    );

    return (
        <section className="gallery-section" id="scheduler">
            <h3>Scheduler — agenda com grade de tempo</h3>
            <p className="description">
                O <code>Calendar</code> é seletor de data: responde “qual dia?”. Este responde “o
                que tem nesses dias, e quando” — eixo de tempo, evento dimensionado pela duração e
                sobreposição resolvida em colunas. Horário local, e evento cruzando meia-noite
                aparece nas duas colunas.
            </p>

            <Example
                title="Semana"
                code={`<Scheduler
  events={events}
  days={7}
  startHour={8}
  endHour={20}
  onEventClick={(event) => abrir(event.id)}
  onSlotClick={(start) => criarEm(start)}
/>`}
                note="Segunda tem três eventos sobrepostos (cluster de 3). Terça tem dois encostados — encostar não é sobrepor, então ficam com largura cheia. Quarta reaproveita uma coluna liberada. Clique num evento ou num espaço vazio."
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[1, 3, 7].map((n) => (
                            <Button
                                key={n}
                                variant={dayCount === n ? "primary" : "secondary"}
                                onClick={() => setDayCount(n)}
                            >
                                {n === 1 ? "Dia" : `${n} dias`}
                            </Button>
                        ))}
                    </div>

                    <Scheduler
                        events={WEEK}
                        anchor={MONDAY}
                        now={NOW}
                        days={dayCount}
                        startHour={8}
                        endHour={20}
                        onEventClick={setSelected}
                        onSlotClick={setCreated}
                    />

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {selected && <Badge variant="primary">selecionado: {selected.title}</Badge>}
                        {created && <Badge>novo em: {timeLabel.format(created)}</Badge>}
                        {!selected && !created && (
                            <span className="description">
                                Clique num evento, ou num espaço vazio da coluna.
                            </span>
                        )}
                    </div>
                </div>
            </Example>

            <Example
                title="Evento cruzando meia-noite"
                code={`// 23:00 → 01:00 vira dois segmentos, um por coluna
{ id: "x", title: "Plantão", start: new Date(2026, 6, 27, 23, 0), end: new Date(2026, 6, 28, 1, 0) }`}
                note="A janela vai de 00h a 24h aqui pra os dois pedaços ficarem visíveis. Cada segmento é clipado à janela do seu dia."
            >
                <Scheduler
                    events={[
                        {
                            id: "x",
                            title: "Plantão",
                            start: new Date(2026, 6, 27, 23, 0),
                            end: new Date(2026, 6, 28, 1, 0),
                        },
                    ]}
                    anchor={MONDAY}
                    now={NOW}
                    days={2}
                    startHour={0}
                    endHour={24}
                    showCurrentTime={false}
                />
            </Example>

            <Example
                title="Agenda vazia"
                code={`<Scheduler events={[]} days={3} />`}
                note="Sem eventos, sem faixa de dia inteiro — a grade e o gutter de horas continuam de pé."
            >
                <Scheduler
                    events={[]}
                    anchor={MONDAY}
                    now={NOW}
                    days={3}
                    startHour={9}
                    endHour={13}
                />
            </Example>
        </section>
    );
}
