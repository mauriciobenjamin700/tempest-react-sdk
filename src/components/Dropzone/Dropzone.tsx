import { useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Dropzone.module.css";

/** Props for {@link Dropzone}. */
export interface DropzoneProps {
    /** Called with the accepted files after a drop or file-dialog selection. */
    onDrop: (files: File[]) => void;
    /** `accept` attribute forwarded to the hidden file input. */
    accept?: string;
    /** Allow selecting/dropping multiple files. Default `true`. */
    multiple?: boolean;
    /** Disable interaction. */
    disabled?: boolean;
    /** Maximum file size in bytes; larger files are filtered out. */
    maxSize?: number;
    /** Called with files rejected by `maxSize`. */
    onReject?: (files: File[]) => void;
    /** Custom inner content. Falls back to a default prompt. */
    children?: ReactNode;
    /** Extra class applied to the drop area. */
    className?: string;
}

/**
 * Drag-and-drop file area with a hidden file input. Clickable and keyboard
 * focusable; filters by `maxSize` before calling `onDrop`.
 *
 * @example
 * <Dropzone accept="image/*" maxSize={5 * 1024 * 1024} onDrop={setFiles}>
 *     Solte imagens aqui ou clique para selecionar
 * </Dropzone>
 */
export function Dropzone({
    onDrop,
    accept,
    multiple = true,
    disabled = false,
    maxSize,
    onReject,
    children,
    className,
}: DropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = (fileList: FileList | null): void => {
        if (!fileList || fileList.length === 0) return;
        const all = Array.from(fileList);
        const limited = multiple ? all : all.slice(0, 1);

        if (maxSize === undefined) {
            onDrop(limited);
            return;
        }

        const accepted: File[] = [];
        const rejected: File[] = [];
        for (const file of limited) {
            if (file.size > maxSize) rejected.push(file);
            else accepted.push(file);
        }
        if (rejected.length > 0) onReject?.(rejected);
        if (accepted.length > 0) onDrop(accepted);
    };

    const openDialog = (): void => {
        if (disabled) return;
        inputRef.current?.click();
    };

    const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
        if (disabled) return;
        setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        handleFiles(event.dataTransfer.files);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openDialog();
        }
    };

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            className={cn(
                styles.zone,
                isDragging && styles.dragging,
                disabled && styles.disabled,
                className,
            )}
            onClick={openDialog}
            onKeyDown={handleKeyDown}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                type="file"
                className={styles.input}
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                onChange={(event) => {
                    handleFiles(event.target.files);
                    event.target.value = "";
                }}
            />
            {children ?? (
                <span className={styles.prompt}>
                    Arraste arquivos aqui ou clique para selecionar
                </span>
            )}
        </div>
    );
}
