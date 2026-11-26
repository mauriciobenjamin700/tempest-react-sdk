import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InteractionReport, PerfSnapshot } from "@/perf/monitor-types";
import { PerfHud } from "./PerfHud";

const REPORT: InteractionReport = {
    name: "checkout",
    startTime: 10,
    totalMs: 200,
    spans: [
        {
            name: "pay",
            path: "pay",
            depth: 0,
            startMs: 0,
            durationMs: 150,
            longFrameMs: 60,
            failed: false,
        },
        {
            name: "charge",
            path: "pay/charge",
            depth: 1,
            startMs: 50,
            durationMs: 100,
            longFrameMs: 0,
            failed: true,
        },
    ],
    cpu: { longFrameMs: 60, longFrames: 1, peakPressure: "fair" },
    battery: { start: null, end: null },
    input: null,
    device: { hardwareConcurrency: 8, deviceMemoryGb: 4, jsHeapUsedMb: null },
    failed: true,
    measuredAt: 0,
};

const SNAPSHOT: PerfSnapshot = {
    battery: { level: 0.82, charging: false, at: 0, drainPerHour: 6.25 },
    pressure: "serious",
    inputs: [
        {
            interactionId: 1,
            type: "click",
            startTime: 0,
            inputDelayMs: 20,
            processingMs: 60,
            presentationMs: 20,
            durationMs: 104,
        },
    ],
    reports: [REPORT],
    support: {
        battery: true,
        pressure: true,
        longFrames: "long-animation-frame",
        eventTiming: true,
    },
};

const EMPTY: PerfSnapshot = {
    battery: null,
    pressure: null,
    inputs: [],
    reports: [],
    support: { battery: false, pressure: false, longFrames: null, eventTiming: false },
};

describe("PerfHud", () => {
    it("summarises battery, CPU and the last interaction while collapsed", () => {
        render(<PerfHud snapshot={SNAPSHOT} />);
        const panel = screen.getByRole("complementary", { name: "Desempenho" });
        expect(panel.querySelector("details")).not.toHaveAttribute("open");
        expect(within(panel).getByText("82% · CPU alta · checkout 200 ms")).toBeInTheDocument();
    });

    it("shows the drain rate, the pressure and the gesture phases when open", () => {
        render(<PerfHud snapshot={SNAPSHOT} defaultOpen />);
        expect(screen.getByText("82% na bateria · 6.3 %/h")).toBeInTheDocument();
        expect(screen.getByText("alta")).toBeInTheDocument();
        const input = screen.getByRole("region", { name: "Último toque" });
        expect(within(input).getByText("espera 20 ms")).toBeInTheDocument();
        expect(within(input).getByText("handler 60 ms")).toBeInTheDocument();
        expect(within(input).getByText("pintura 20 ms")).toBeInTheDocument();
    });

    it("draws each step at its offset and width within the interaction", () => {
        const { container } = render(<PerfHud snapshot={SNAPSHOT} defaultOpen />);
        expect(screen.getByText("charge")).toBeInTheDocument();
        expect(screen.getByText("falhou")).toBeInTheDocument();
        expect(screen.getByText("60 ms travado em 1 frame(s) longo(s)")).toBeInTheDocument();
        const bars = container.querySelectorAll<HTMLElement>("ol span[aria-hidden] > span");
        expect(bars[1]?.style.left).toBe("25%");
        expect(bars[1]?.style.width).toBe("50%");
    });

    it("says which sources the browser withholds instead of showing zeros", () => {
        render(<PerfHud snapshot={EMPTY} defaultOpen />);
        expect(screen.getAllByText("indisponível neste navegador")).toHaveLength(2);
        expect(screen.getByText("Nenhuma interação medida ainda.")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Último toque" })).not.toBeInTheDocument();
    });

    it("shows a placeholder while a supported source has not reported yet", () => {
        render(
            <PerfHud
                snapshot={{
                    ...EMPTY,
                    support: { ...EMPTY.support, battery: true, pressure: true },
                }}
                defaultOpen
            />,
        );
        expect(screen.getAllByText("…")).toHaveLength(2);
    });

    it("says the drain is still being measured, and hides it while charging", () => {
        const { rerender } = render(
            <PerfHud
                snapshot={{
                    ...SNAPSHOT,
                    battery: { level: 0.5, charging: false, at: 0, drainPerHour: null },
                }}
                defaultOpen
            />,
        );
        expect(screen.getByText("50% na bateria · medindo consumo…")).toBeInTheDocument();
        rerender(
            <PerfHud
                snapshot={{
                    ...SNAPSHOT,
                    battery: { level: 0.5, charging: true, at: 0, drainPerHour: null },
                }}
                defaultOpen
            />,
        );
        expect(screen.getByText("50% carregando")).toBeInTheDocument();
    });

    it("limits the list to maxReports", () => {
        const reports = ["a", "b", "c"].map((name, i) => ({ ...REPORT, name, startTime: i }));
        render(<PerfHud snapshot={{ ...SNAPSHOT, reports }} maxReports={2} defaultOpen />);
        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("b")).toBeInTheDocument();
        expect(screen.queryByText("c")).not.toBeInTheDocument();
    });

    it("renders in the flow when inline and floats in a corner otherwise", () => {
        const { rerender } = render(<PerfHud snapshot={EMPTY} position="inline" />);
        const panel = screen.getByRole("complementary");
        const inlineClass = panel.className;
        rerender(<PerfHud snapshot={EMPTY} position="top-left" />);
        expect(screen.getByRole("complementary").className).not.toBe(inlineClass);
    });

    it("lets the app replace every text", () => {
        render(
            <PerfHud
                snapshot={SNAPSHOT}
                defaultOpen
                labels={{
                    title: "Performance",
                    discharging: "on battery",
                    drain: (rate) => `${rate} pts/h`,
                    pressure: {
                        nominal: "nominal",
                        fair: "fair",
                        serious: "serious",
                        critical: "critical",
                    },
                }}
            />,
        );
        expect(screen.getByRole("complementary", { name: "Performance" })).toBeInTheDocument();
        expect(screen.getByText("82% on battery · 6.3 pts/h")).toBeInTheDocument();
    });
});
