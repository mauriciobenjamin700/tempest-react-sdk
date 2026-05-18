import { useState } from "react";
import {
    Accordion,
    AspectRatio,
    Center,
    Combobox,
    DropdownMenu,
    Hide,
    Popover,
    RangeSlider,
    RatingStars,
    Show,
    Spacer,
    useBreakpoint,
    useLocalStorage,
    useToggle,
    Button,
    Card,
    Stack,
} from "tempest-react-sdk";

export function NewIn030Section() {
    const bp = useBreakpoint();
    const [rating, setRating] = useState(3);
    const [range, setRange] = useState<[number, number]>([20, 80]);
    const [combo, setCombo] = useState("react");
    const [counter, setCounter, removeCounter] = useLocalStorage<number>("gallery-counter", 0);
    const [drawerOpen, drawer] = useToggle();

    return (
        <section id="new-in-030">
            <h2>New in 0.3.0</h2>
            <p>
                Componentes, hooks e utilities introduzidos no roadmap responsive. Todos descritos
                em <code>docs/styles.md</code>.
            </p>

            <h3>useBreakpoint() + Show / Hide</h3>
            <Card>
                <Stack gap={2}>
                    <p>
                        Current: <code>{bp.current}</code> · width: <code>{bp.width}px</code> ·
                        isMobile: <code>{String(bp.isMobile)}</code>
                    </p>
                    <Show above="md">
                        <p>Desktop content (≥ md)</p>
                    </Show>
                    <Hide above="md">
                        <p>Mobile content (&lt; md)</p>
                    </Hide>
                </Stack>
            </Card>

            <h3>Accordion</h3>
            <Accordion
                items={[
                    { id: "a", title: "Section A", children: "Content A" },
                    { id: "b", title: "Section B", children: "Content B" },
                    { id: "c", title: "Disabled", children: "x", disabled: true },
                ]}
            />

            <h3>Popover</h3>
            <Popover trigger={<Button variant="secondary">Open popover</Button>} placement="bottom">
                <p>Anchored panel. Click outside or Esc to close.</p>
            </Popover>

            <h3>DropdownMenu</h3>
            <DropdownMenu
                trigger={<Button>Actions ▾</Button>}
                items={[
                    { type: "label", id: "l", label: "Account" },
                    { type: "item", id: "p", label: "Profile", onSelect: () => undefined },
                    { type: "item", id: "s", label: "Settings", onSelect: () => undefined },
                    { type: "separator", id: "sep" },
                    {
                        type: "item",
                        id: "d",
                        label: "Delete",
                        danger: true,
                        onSelect: () => undefined,
                    },
                ]}
            />

            <h3>RatingStars</h3>
            <RatingStars value={rating} onChange={setRating} />

            <h3>RangeSlider</h3>
            <RangeSlider
                value={range}
                onChange={setRange}
                label="Preço"
                formatValue={([lo, hi]) => `R$ ${lo} – R$ ${hi}`}
            />

            <h3>Combobox</h3>
            <Combobox
                value={combo}
                onChange={setCombo}
                label="Framework"
                options={[
                    { value: "react", label: "React" },
                    { value: "vue", label: "Vue" },
                    { value: "svelte", label: "Svelte" },
                    { value: "solid", label: "SolidJS" },
                    { value: "angular", label: "Angular" },
                ]}
            />

            <h3>Layout primitives</h3>
            <Stack direction={{ mobile: "vertical", desktop: "horizontal" }} gap={3}>
                <Center minHeight="120px" style={{ background: "var(--tempest-surface)" }}>
                    Center
                </Center>
                <Card>
                    Spacer pushes
                    <Spacer axis="x" />
                    right
                </Card>
                <AspectRatio ratio={16 / 9} style={{ background: "var(--tempest-primary-soft)" }}>
                    <Center>16:9</Center>
                </AspectRatio>
            </Stack>

            <h3>Hooks novos</h3>
            <Card>
                <Stack gap={2}>
                    <p>
                        useLocalStorage counter: <strong>{counter}</strong>
                    </p>
                    <Stack direction="horizontal" gap={2}>
                        <Button onClick={() => setCounter((c) => c + 1)}>+1</Button>
                        <Button variant="ghost" onClick={removeCounter}>
                            Reset
                        </Button>
                    </Stack>
                    <p>
                        useToggle drawer: <code>{String(drawerOpen)}</code>{" "}
                        <Button variant="link" onClick={drawer.toggle}>
                            toggle
                        </Button>
                    </p>
                </Stack>
            </Card>
        </section>
    );
}
