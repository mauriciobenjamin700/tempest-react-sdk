import { type ReactNode } from "react";
import { CopyButton } from "tempest-react-sdk";

interface ExampleProps {
    /** Short title for this example. */
    title: string;
    /** Source snippet shown next to the live demo (copy-pasteable). */
    code: string;
    /** Optional one-liner under the title. */
    note?: ReactNode;
    /** The live, rendered demo. */
    children: ReactNode;
}

/**
 * The building block of every gallery section: a live demo on the left and its
 * source snippet (with a copy button) on the right. Collapses to a single
 * column on narrow screens.
 */
export function Example({ title, code, note, children }: ExampleProps) {
    return (
        <div className="example">
            <div className="example-head">
                <div>
                    <h4>{title}</h4>
                    {note && <p className="example-note">{note}</p>}
                </div>
                <CopyButton value={code} className="example-copy">
                    Copiar
                </CopyButton>
            </div>
            <div className="example-body">
                <div className="example-demo">{children}</div>
                <pre className="example-code">
                    <code>{code}</code>
                </pre>
            </div>
        </div>
    );
}
