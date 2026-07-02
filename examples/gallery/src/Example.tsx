import { type ReactNode } from "react";
import { CopyButton } from "tempest-react-sdk";

/** One row of the optional props reference table. */
export interface ExampleProp {
    /** Prop name. */
    name: string;
    /** TypeScript type, as a short string. */
    type: string;
    /** Default value, if any. */
    default?: string;
    /** One-line description. */
    description: string;
}

interface ExampleProps {
    /** Short title for this example. */
    title: string;
    /** Source snippet shown next to the live demo (copy-pasteable). */
    code: string;
    /** Optional one-liner under the title. */
    note?: ReactNode;
    /**
     * Stable anchor id for deep-linking (`#id`). When set, the title becomes a
     * permalink you can share.
     */
    id?: string;
    /** Optional props reference rendered as a table under the demo. */
    props?: ExampleProp[];
    /** The live, rendered demo. */
    children: ReactNode;
}

/**
 * The building block of every gallery section: a live demo on the left and its
 * source snippet (with a copy button) on the right. Collapses to a single
 * column on narrow screens. Pass `id` for a deep-linkable anchor and `props`
 * to document the component's API inline.
 */
export function Example({ title, code, note, id, props, children }: ExampleProps) {
    return (
        <div className="example" id={id}>
            <div className="example-head">
                <div>
                    <h4>
                        {id ? (
                            <a href={`#${id}`} className="example-anchor">
                                {title}
                            </a>
                        ) : (
                            title
                        )}
                    </h4>
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
            {props && props.length > 0 && (
                <div className="example-props">
                    <table>
                        <thead>
                            <tr>
                                <th>Prop</th>
                                <th>Tipo</th>
                                <th>Default</th>
                                <th>Descrição</th>
                            </tr>
                        </thead>
                        <tbody>
                            {props.map((p) => (
                                <tr key={p.name}>
                                    <td>
                                        <code>{p.name}</code>
                                    </td>
                                    <td>
                                        <code>{p.type}</code>
                                    </td>
                                    <td>{p.default ? <code>{p.default}</code> : "—"}</td>
                                    <td>{p.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
