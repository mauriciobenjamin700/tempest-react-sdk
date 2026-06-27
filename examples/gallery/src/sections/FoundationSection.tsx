import { Button, createSelectors, createStore } from "tempest-react-sdk";
import { Example } from "../Example";

interface CounterState {
    count: number;
    inc: () => void;
    reset: () => void;
}

/**
 * Store Zustand criada no escopo de módulo (uma única instância compartilhada
 * por todo o app). `createSelectors` expõe seletores por campo em `.use`.
 * Persiste em localStorage sob a chave `gallery-counter`.
 */
const useCounter = createSelectors(
    createStore<CounterState>(
        (set) => ({
            count: 0,
            inc: () => set((s) => ({ count: s.count + 1 })),
            reset: () => set({ count: 0 }),
        }),
        { persist: { name: "gallery-counter" } },
    ),
);

/**
 * Demonstra as fábricas de estado do SDK: `createStore` (Zustand + persist) e
 * `createSelectors` (seletores tipados por campo).
 */
export function FoundationSection() {
    const count = useCounter.use.count();

    return (
        <section className="gallery-section" id="foundation">
            <h3>Store (Zustand): createStore + createSelectors</h3>
            <p className="description">
                Estado global tipado com persistência opcional, sem boilerplate de Zustand.
            </p>

            <Example
                title="Contador persistente"
                note="O valor sobrevive a recarregamentos da página (localStorage: gallery-counter)."
                code={`const useCounter = createSelectors(
  createStore<CounterState>(
    (set) => ({
      count: 0,
      inc: () => set((s) => ({ count: s.count + 1 })),
      reset: () => set({ count: 0 }),
    }),
    { persist: { name: "gallery-counter" } },
  ),
);

function Counter() {
  const count = useCounter.use.count();
  return (
    <>
      <strong>{count}</strong>
      <Button onClick={() => useCounter.getState().inc()}>Incrementar</Button>
      <Button variant="ghost" onClick={() => useCounter.getState().reset()}>Zerar</Button>
    </>
  );
}`}
            >
                <strong style={{ fontSize: "1.5rem" }}>{count}</strong>
                <Button onClick={() => useCounter.getState().inc()}>Incrementar</Button>
                <Button variant="ghost" onClick={() => useCounter.getState().reset()}>
                    Zerar
                </Button>
            </Example>

            <Example
                title="Lendo uma fatia"
                note="`.use.count()` assina apenas o campo `count` — re-renderiza só quando ele muda."
                code={`const count = useCounter.use.count();

return <p>Contagem atual: {count}</p>;`}
            >
                <p>Contagem atual: {count}</p>
            </Example>
        </section>
    );
}
