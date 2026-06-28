import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
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

    // Sync external `value` into the editor without re-triggering `onUpdate`.
    useEffect(() => {
        if (!editor) return;
        if (value !== editor.getHTML()) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value]);

    // Keep the editable flag in sync with the prop.
    useEffect(() => {
        if (!editor) return;
        editor.setEditable(editable);
    }, [editor, editable]);

    if (!editor) return null;

    const canUndo = editor.can().chain().focus().undo().run();
    const canRedo = editor.can().chain().focus().redo().run();

    return (
        <div className={cn(styles.wrapper, className)}>
            {toolbar && (
                <div className={styles.toolbar} role="toolbar" aria-label="Formatação de texto">
                    <button
                        type="button"
                        className={cn(styles.button, editor.isActive("bold") && styles.active)}
                        aria-label="Negrito"
                        aria-pressed={editor.isActive("bold")}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                        <Bold size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, editor.isActive("italic") && styles.active)}
                        aria-label="Itálico"
                        aria-pressed={editor.isActive("italic")}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <Italic size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, editor.isActive("strike") && styles.active)}
                        aria-label="Tachado"
                        aria-pressed={editor.isActive("strike")}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                    >
                        <Strikethrough size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(styles.button, editor.isActive("code") && styles.active)}
                        aria-label="Código"
                        aria-pressed={editor.isActive("code")}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                    >
                        <Code size={16} aria-hidden />
                    </button>
                    <span className={styles.separator} aria-hidden />
                    <button
                        type="button"
                        className={cn(
                            styles.button,
                            editor.isActive("heading", { level: 1 }) && styles.active,
                        )}
                        aria-label="Título 1"
                        aria-pressed={editor.isActive("heading", { level: 1 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    >
                        <Heading1 size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(
                            styles.button,
                            editor.isActive("heading", { level: 2 }) && styles.active,
                        )}
                        aria-label="Título 2"
                        aria-pressed={editor.isActive("heading", { level: 2 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    >
                        <Heading2 size={16} aria-hidden />
                    </button>
                    <span className={styles.separator} aria-hidden />
                    <button
                        type="button"
                        className={cn(
                            styles.button,
                            editor.isActive("bulletList") && styles.active,
                        )}
                        aria-label="Lista com marcadores"
                        aria-pressed={editor.isActive("bulletList")}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                    >
                        <List size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(
                            styles.button,
                            editor.isActive("orderedList") && styles.active,
                        )}
                        aria-label="Lista numerada"
                        aria-pressed={editor.isActive("orderedList")}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    >
                        <ListOrdered size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={cn(
                            styles.button,
                            editor.isActive("blockquote") && styles.active,
                        )}
                        aria-label="Citação"
                        aria-pressed={editor.isActive("blockquote")}
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
