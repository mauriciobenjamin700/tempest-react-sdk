import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Button } from "../Button";
import { Stepper } from "../Stepper";
import styles from "./Wizard.module.css";

/** One step of the flow. */
export interface WizardStep {
    /** Stable identifier. */
    id: string;
    /** Step label shown in the indicator. */
    label: string;
    /** Optional description under the label. */
    description?: string;
    /** Step body. A function receives the flow controls, for a "skip" link inside the form. */
    content: ReactNode | ((controls: WizardControls) => ReactNode);
    /**
     * Gate for leaving this step forward. Return `false` (or a rejected/`false`
     * promise) to keep the user here — typically `() => form.trigger()`.
     * Async is supported: the Next button shows a pending state while it runs.
     */
    validate?: () => boolean | Promise<boolean>;
    /** Marks the step as optional, so `onComplete` can ignore it. */
    optional?: boolean;
}

/** Flow controls handed to a step body and to `renderActions`. */
export interface WizardControls {
    /** Zero-based index of the current step. */
    activeIndex: number;
    /** The current step. */
    step: WizardStep;
    /** `true` while a `validate` promise is pending. */
    validating: boolean;
    isFirst: boolean;
    isLast: boolean;
    /** Run the current step's `validate` and advance when it passes. */
    next: () => Promise<void>;
    /** Go back one step. No validation — going back never blocks. */
    back: () => void;
    /** Jump to an index. Forward jumps validate every step in between. */
    goTo: (index: number) => Promise<void>;
}

export interface WizardProps {
    steps: WizardStep[];
    /** Controlled active index. */
    activeIndex?: number;
    /** Uncontrolled initial index. Default `0`. */
    defaultActiveIndex?: number;
    onStepChange?: (index: number, step: WizardStep) => void;
    /** Called when the last step passes validation. */
    onComplete?: () => void | Promise<void>;
    /** Label of the advance button. Default `"Next"`. */
    nextLabel?: string;
    /** Label of the back button. Default `"Back"`. */
    backLabel?: string;
    /** Label of the button on the last step. Default `"Finish"`. */
    finishLabel?: string;
    /**
     * Allow clicking the indicator to jump. Default `false` — a wizard exists
     * because order matters, and a free jump skips the gates.
     */
    clickableSteps?: boolean;
    /** Replace the default button row. */
    renderActions?: (controls: WizardControls) => ReactNode;
    className?: string;
}

/**
 * Multi-step flow: step indicator, one body at a time, and navigation that
 * respects per-step validation.
 *
 * `Stepper` draws the indicator; this owns the part every app was rewriting — the
 * active index, the async gate before advancing, the disabled/pending buttons and
 * the completion call.
 *
 * Only the active step's body is mounted. Uncommitted input in a step you leave is
 * therefore lost unless the state lives outside (react-hook-form's `FormProvider`,
 * a store, a parent `useState`) — which is the right place for it anyway, since
 * the last step usually needs to submit everything at once.
 *
 * @example
 * ```tsx
 * const form = useZodForm(schema);
 *
 * <FormProvider {...form}>
 *   <Wizard
 *     steps={[
 *       {
 *         id: "dados",
 *         label: "Dados",
 *         validate: () => form.trigger(["nome", "email"]),
 *         content: (
 *           <>
 *             <FormField name="nome" label="Nome"><Input /></FormField>
 *             <FormField name="email" label="E-mail"><Input type="email" /></FormField>
 *           </>
 *         ),
 *       },
 *       { id: "revisao", label: "Revisão", content: <Review /> },
 *     ]}
 *     onComplete={form.handleSubmit(onSubmit)}
 *   />
 * </FormProvider>
 * ```
 */
export function Wizard({
    steps,
    activeIndex,
    defaultActiveIndex = 0,
    onStepChange,
    onComplete,
    nextLabel = "Next",
    backLabel = "Back",
    finishLabel = "Finish",
    clickableSteps = false,
    renderActions,
    className,
}: WizardProps) {
    const isControlled = activeIndex !== undefined;
    const [internalIndex, setInternalIndex] = useState(defaultActiveIndex);
    const [validating, setValidating] = useState(false);

    const current = Math.min(isControlled ? activeIndex : internalIndex, steps.length - 1);
    const step = steps[current];

    const moveTo = useCallback(
        (index: number): void => {
            if (!isControlled) setInternalIndex(index);
            onStepChange?.(index, steps[index]);
        },
        [isControlled, onStepChange, steps],
    );

    /**
     * Run a step's gate. A gate that throws counts as "not allowed": a `validate`
     * wired to a network check should not strand the user on a half-advanced flow
     * when the request fails.
     */
    const runValidate = useCallback(async (candidate: WizardStep): Promise<boolean> => {
        if (!candidate.validate) return true;
        setValidating(true);
        try {
            return await candidate.validate();
        } catch {
            return false;
        } finally {
            setValidating(false);
        }
    }, []);

    const next = useCallback(async (): Promise<void> => {
        if (!(await runValidate(step))) return;
        if (current === steps.length - 1) {
            await onComplete?.();
            return;
        }
        moveTo(current + 1);
    }, [current, moveTo, onComplete, runValidate, step, steps.length]);

    const back = useCallback((): void => {
        if (current > 0) moveTo(current - 1);
    }, [current, moveTo]);

    const goTo = useCallback(
        async (index: number): Promise<void> => {
            const target = Math.max(0, Math.min(index, steps.length - 1));
            if (target === current) return;
            if (target < current) {
                moveTo(target);
                return;
            }
            for (let i = current; i < target; i += 1) {
                if (!(await runValidate(steps[i]))) return;
            }
            moveTo(target);
        },
        [current, moveTo, runValidate, steps],
    );

    const controls = useMemo<WizardControls>(
        () => ({
            activeIndex: current,
            step,
            validating,
            isFirst: current === 0,
            isLast: current === steps.length - 1,
            next,
            back,
            goTo,
        }),
        [back, current, goTo, next, step, steps.length, validating],
    );

    const indicatorSteps = useMemo(
        () =>
            steps.map((item) => ({
                label: item.label,
                description: item.optional
                    ? `${item.description ?? ""} (optional)`.trim()
                    : item.description,
            })),
        [steps],
    );

    return (
        <div className={cn(styles.wizard, className)}>
            <Stepper
                steps={indicatorSteps}
                current={current}
                onStepClick={clickableSteps ? (index) => void goTo(index) : undefined}
            />

            <div className={styles.body} role="group" aria-label={step.label}>
                {typeof step.content === "function" ? step.content(controls) : step.content}
            </div>

            {renderActions ? (
                renderActions(controls)
            ) : (
                <div className={styles.actions}>
                    <Button
                        variant="secondary"
                        onClick={back}
                        disabled={controls.isFirst || validating}
                    >
                        {backLabel}
                    </Button>
                    <Button onClick={() => void next()} loading={validating}>
                        {controls.isLast ? finishLabel : nextLabel}
                    </Button>
                </div>
            )}
        </div>
    );
}
