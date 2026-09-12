import { useState } from "react";

import { formatBytes } from "@/utils/numbers";

import { AudioPlayer } from "../AudioPlayer";
import { Lightbox } from "../Lightbox";
import { VideoPlayer } from "../VideoPlayer";
import type { ChatAttachment } from "./chat-groups";
import styles from "./Chat.module.css";

/** Strings this view needs, passed in so the locale table stays in one file. */
export interface ChatAttachmentStrings {
    voiceNote: string;
    download: string;
}

export interface ChatAttachmentsProps {
    /** What this message carries. */
    attachments: readonly ChatAttachment[];
    /** Labels, from `chatStrings(locale)`. */
    strings: ChatAttachmentStrings;
}

/** Bars a voice note draws when the app gave no peaks. */
const FLAT_WAVEFORM = Array.from({ length: 28 }, () => 0.25);

/** `1:04` from milliseconds — a duration, never a clock time. */
function durationLabel(durationMs: number): string {
    const total = Math.round(durationMs / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The media half of a bubble.
 *
 * Kept in its own module, and reached through `lazy()` from the thread, because
 * it pulls three of the heaviest components in the SDK — `Lightbox`,
 * `VideoPlayer`, `AudioPlayer` — and a support thread of plain text should not
 * pay for a photo viewer it never opens. The thread renders it only for messages
 * that actually carry an attachment, so that chunk is requested the first time
 * one appears.
 *
 * Nothing here is new UI: an image opens the SDK's lightbox, a video and an audio
 * clip use the SDK's players, and a file is a download row. That composition is
 * the whole point — every app was writing it again, the same way.
 *
 * @param props - The attachments and the locale strings.
 * @returns The rendered attachment list.
 */
export function ChatAttachments({ attachments, strings }: ChatAttachmentsProps) {
    const images = attachments.filter((attachment) => attachment.kind === "image");
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    return (
        <div className={styles.attachments}>
            {attachments.map((attachment, index) => {
                const key = `${attachment.kind}-${attachment.url}-${index}`;
                if (attachment.kind === "image") {
                    const position = images.indexOf(attachment);
                    return (
                        <button
                            key={key}
                            type="button"
                            className={styles.imageAttachment}
                            onClick={() => setLightboxIndex(position)}
                        >
                            <img
                                src={attachment.thumbnailUrl ?? attachment.url}
                                alt={attachment.alt ?? attachment.name ?? ""}
                                loading="lazy"
                            />
                        </button>
                    );
                }
                if (attachment.kind === "video") {
                    return (
                        <VideoPlayer
                            key={key}
                            src={attachment.url}
                            durationMs={attachment.durationMs}
                            poster={attachment.thumbnailUrl}
                            className={styles.videoAttachment}
                        />
                    );
                }
                if (attachment.kind === "voice") {
                    return (
                        <div key={key} className={styles.voiceAttachment}>
                            <div className={styles.waveform} aria-hidden="true">
                                {(attachment.waveform ?? FLAT_WAVEFORM).map((peak, bar) => (
                                    <span
                                        key={bar}
                                        style={{
                                            height: `${Math.max(8, Math.min(100, peak * 100))}%`,
                                        }}
                                    />
                                ))}
                            </div>
                            <AudioPlayer
                                src={attachment.url}
                                durationMs={attachment.durationMs}
                                aria-label={strings.voiceNote}
                            />
                        </div>
                    );
                }
                if (attachment.kind === "audio") {
                    return (
                        <AudioPlayer
                            key={key}
                            src={attachment.url}
                            durationMs={attachment.durationMs}
                        />
                    );
                }
                return (
                    <a
                        key={key}
                        className={styles.fileAttachment}
                        href={attachment.url}
                        download={attachment.name ?? true}
                    >
                        <span className={styles.fileName}>
                            {attachment.name ?? strings.download}
                        </span>
                        <span className={styles.fileMeta}>
                            {[
                                attachment.sizeBytes !== undefined
                                    ? formatBytes(attachment.sizeBytes)
                                    : null,
                                attachment.durationMs !== undefined
                                    ? durationLabel(attachment.durationMs)
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </a>
                );
            })}

            {images.length > 0 && (
                <Lightbox
                    items={images.map((image) => ({
                        src: image.url,
                        alt: image.alt ?? image.name ?? "",
                        thumbnail: image.thumbnailUrl,
                    }))}
                    open={lightboxIndex !== null}
                    index={lightboxIndex ?? 0}
                    onIndexChange={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    );
}
