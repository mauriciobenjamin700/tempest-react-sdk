/**
 * @tempest-limits file-lines, function-lines — the body builds the tiptap editor,
 * its toolbar state and the change plumbing: every toolbar button reads
 * `editor.isActive`, so the toolbar cannot be lifted out without passing the editor
 * instance back down.
 */
import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Italic,
    List,
    ListOrdered,
    Quote,
    Redo2,
    Strikethrough,
    Undo2,
} from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./RichTextEditor.module.css";

export interface RichTextEditorProps {
    /** Current editor content as an HTML string (controlled). */
    value: string;
    /** Called with the updated HTML whenever the document changes. */
    onChange: (html: string) => void;
    /** Placeholder text shown when the editor is empty. */
    placeholder?: string;
    /** Whether the content is editable. Defaults to `true`. */
    editable?: boolean;
    /** Whether to render the formatting toolbar. Defaults to `true`. */
    toolbar?: boolean;
    /** Extra class names applied to the wrapper element. */
    className?: string;
}

/**
 * RichTextEditor — a controlled WYSIWYG editor built on tiptap v3.
 *
 * Renders an optional formatting toolbar (bold, italic, strike, code, headings,
 * lists, blockquote, undo/redo) above a ProseMirror-backed editable area. The
 * document is controlled via the `value` (HTML) / `onChange` pair: external
 * changes to `value` are synced into the editor without re-emitting updates.
 *
 * The toolbar's pressed states and the undo/redo `disabled` flags come from
 * `useEditorState`, which subscribes to exactly those values. `useEditor` does
 * not re-render on transactions (the tiptap v3 default), so reading `isActive`
 * and `can()` directly in the render body left every button stale — toggling
 * bold with a collapsed cursor arms the mark without changing the document, so no
 * update event ever brought React back to recompute the state. Subscribing
 * re-renders only when one of the tracked values actually flips, which is also
 * cheaper than re-rendering on every keystroke.
 *
 * Two effects keep the instance aligned with the props: one pushes an external
 * `value` change into the document with `emitUpdate: false` (so syncing never
 * re-emits `onChange`), the other mirrors the `editable` flag.
 */
export function RichTextEditor({
    value,
    onChange,
    placeholder,
    editable = true,
    toolbar = true,
    className,
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [StarterKit],
        content: value,
        editable,
        onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    });

    useEffect(() => {
        if (!editor) return;
        if (value !== editor.getHTML()) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value]);

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(editable);
    }, [editor, editable]);

    const toolbarState = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            strike: instance.isActive("strike"),
            code: instance.isActive("code"),
            heading1: instance.isActive("heading", { level: 1 }),
            heading2: instance.isActive("heading", { level: 2 }),
            bulletList: instance.isActive("bulletList"),
            orderedList: instance.isActive("orderedList"),
            blockquote: instance.isActive("blockquote"),
            canUndo: instance.can().chain().focus().undo().run(),
            canRedo: instance.can().chain().focus().redo().run(),
        }),
    });

    if (!editor || !toolbarState) return null;

    const canUndo = toolbarState.canUndo;
    const canRedo = toolbarState.canRedo;

    return (
        <div className={cn(styles.wrapper, className)}>
            {toolbar && (
                <div className={styles.toolbar} role="toolbar" aria-label="Formatação de texto">
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.bold && styles.active)}
                        aria-label="Negrito"
                        aria-pressed={toolbarState.bold}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                        <Bold size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.italic && styles.active)}
                        aria-label="Itálico"
                        aria-pressed={toolbarState.italic}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <Italic size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.strike && styles.active)}
                        aria-label="Tachado"
                        aria-pressed={toolbarState.strike}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                    >
                        <Strikethrough size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.code && styles.active)}
                        aria-label="Código"
                        aria-pressed={toolbarState.code}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                    >
                        <Code size={16} aria-hidden />
                    </button>
                    <span className={styles.separator} aria-hidden />
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.heading1 && styles.active)}
                        aria-label="Título 1"
                        aria-pressed={toolbarState.heading1}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    >
                        <Heading1 size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.heading2 && styles.active)}
                        aria-label="Título 2"
                        aria-pressed={toolbarState.heading2}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    >
                        <Heading2 size={16} aria-hidden />
                    </button>
                    <span className={styles.separator} aria-hidden />
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.bulletList && styles.active)}
                        aria-label="Lista com marcadores"
                        aria-pressed={toolbarState.bulletList}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                    >
                        <List size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.orderedList && styles.active)}
                        aria-label="Lista numerada"
                        aria-pressed={toolbarState.orderedList}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    >
                        <ListOrdered size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, toolbarState.blockquote && styles.active)}
                        aria-label="Citação"
                        aria-pressed={toolbarState.blockquote}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    >
                        <Quote size={16} aria-hidden />
                    </button>
                    <span className={styles.separator} aria-hidden />
                    <button
                        type="button"
                        className={styles.button}
                        aria-label="Desfazer"
                        disabled={!canUndo}
                        onClick={() => editor.chain().focus().undo().run()}
                    >
                        <Undo2 size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={styles.button}
                        aria-label="Refazer"
                        disabled={!canRedo}
                        onClick={() => editor.chain().focus().redo().run()}
                    >
                        <Redo2 size={16} aria-hidden />
                    </button>
                </div>
            )}
            <EditorContent
                editor={editor}
                className={styles.content}
                data-placeholder={placeholder}
            />
        </div>
    );
}
