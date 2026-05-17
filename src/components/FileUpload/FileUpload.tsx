import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { cn } from "@/utils/cn";
import styles from "./FileUpload.module.css";

export interface FileUploadProps {
    /** Files currently in the dropzone (controlled). */
    value: File[];
    /** Called with the new list when the user adds or removes a file. */
    onChange: (files: File[]) => void;
    label?: string;
    /** Accept attribute forwarded to `<input>`. */
    accept?: string;
    /** Allow multiple files. Default: false. */
    multiple?: boolean;
    /** Max file size in bytes. Files above are rejected via `onReject`. */
    maxSize?: number;
    /** Called with rejected files when they exceed `maxSize` or fail the `accept` filter. */
    onReject?: (rejected: { file: File; reason: "size" | "type" }[]) => void;
    disabled?: boolean;
    /** Title shown on the empty dropzone. */
    title?: string;
    /** Helper line below the title. */
    subtitle?: string;
    className?: string;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesAccept(file: File, accept?: string): boolean {
    if (!accept) return true;
    const tokens = accept.split(",").map((t) => t.trim().toLowerCase());
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return tokens.some((token) => {
        if (token.startsWith(".")) return name.endsWith(token);
        if (token.endsWith("/*")) return type.startsWith(token.replace("/*", "/"));
        return type === token;
    });
}

/**
 * Drag-and-drop file dropzone. Pair with `uploadWithProgress` from the SDK
 * to wire actual uploads with byte-level progress.
 */
export function FileUpload({
    value,
    onChange,
    label,
    accept,
    multiple = false,
    maxSize,
    onReject,
    disabled,
    title = "Arraste arquivos aqui ou clique para selecionar",
    subtitle,
    className,
}: FileUploadProps) {
    const [dragging, setDragging] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement>(null);

    function addFiles(incoming: FileList | File[]): void {
        const accepted: File[] = [];
        const rejected: { file: File; reason: "size" | "type" }[] = [];

        for (const file of Array.from(incoming)) {
            if (!matchesAccept(file, accept)) {
                rejected.push({ file, reason: "type" });
                continue;
            }
            if (maxSize && file.size > maxSize) {
                rejected.push({ file, reason: "size" });
                continue;
            }
            accepted.push(file);
        }

        if (rejected.length > 0) onReject?.(rejected);
        if (accepted.length === 0) return;

        const next = multiple ? [...value, ...accepted] : accepted.slice(0, 1);
        onChange(next);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>): void {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
    }

    function remove(index: number): void {
        const next = value.slice();
        next.splice(index, 1);
        onChange(next);
    }

    return (
        <div className={cn(styles.wrapper, className)}>
            {label && <label className={styles.label}>{label}</label>}
            <div
                className={cn(
                    styles.dropzone,
                    dragging && styles.active,
                    disabled && styles.disabled,
                )}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && inputRef.current?.click()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                onDragEnter={(event) => {
                    event.preventDefault();
                    if (!disabled) setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
            >
                <div className={styles.icon} aria-hidden>
                    <UploadIcon />
                </div>
                <p className={styles.title}>{title}</p>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    disabled={disabled}
                    className={styles.hidden}
                    onChange={(event) => {
                        if (event.target.files) addFiles(event.target.files);
                        event.target.value = "";
                    }}
                />
            </div>

            {value.length > 0 && (
                <ul className={styles.files}>
                    {value.map((file, index) => (
                        <li key={`${file.name}-${index}`} className={styles.file}>
                            <div>
                                <div>{file.name}</div>
                                <div className={styles.fileMeta}>{formatSize(file.size)}</div>
                            </div>
                            <button
                                type="button"
                                aria-label={`Remover ${file.name}`}
                                className={styles.remove}
                                onClick={() => remove(index)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function UploadIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
