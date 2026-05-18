import type { CSSProperties, ReactNode } from "react";
import type { OAuthCredential, OAuthError } from "./types";

export type GoogleSignInTheme = "filled_blue" | "filled_black" | "outline";
export type GoogleSignInText = "signin_with" | "signup_with" | "continue_with" | "signin";
export type GoogleSignInShape = "rectangular" | "pill" | "circle" | "square";
export type GoogleSignInSize = "large" | "medium" | "small";

export interface GoogleSignInProps {
    /**
     * `GoogleLogin` component from `@react-oauth/google`. The caller imports
     * it and passes it through so the SDK doesn't take `@react-oauth/google`
     * as a peer dep.
     */
    component: (props: Record<string, unknown>) => ReactNode;
    /** Fired with the validated credential on success. */
    onSuccess: (credential: OAuthCredential) => void | Promise<void>;
    /** Fired with a normalised error on failure. */
    onError?: (error: OAuthError) => void;
    /** Optional locale override (e.g. `"pt-BR"`). Falls back to browser locale. */
    locale?: string;
    /** Visual theme — passed through to `<GoogleLogin>`. */
    theme?: GoogleSignInTheme;
    /** Button text variant. */
    text?: GoogleSignInText;
    /** Button shape. */
    shape?: GoogleSignInShape;
    /** Button size. */
    size?: GoogleSignInSize;
    /** Disable Google's "One Tap" auto-prompt. Default `false`. */
    disableOneTap?: boolean;
    /** Optional `width` override (px) — Google's button is fixed-width. */
    width?: number;
    /** Optional className applied to the wrapper. */
    className?: string;
    /** Optional inline style applied to the wrapper. */
    style?: CSSProperties;
}

/**
 * Thin wrapper over `@react-oauth/google`'s `<GoogleLogin>` that:
 *
 * 1. Normalises the success payload into [[OAuthCredential]] (`idToken`,
 *    `provider: "google"`, `raw`).
 * 2. Normalises errors into [[OAuthError]].
 * 3. Lets you pass `GoogleLogin` via the `component` prop, so the SDK does
 *    not declare `@react-oauth/google` as a peer dep — apps that don't use
 *    Google never pay for it.
 *
 * @example
 * import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
 * import { GoogleSignIn } from "tempest-react-sdk";
 *
 * <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
 *     <GoogleSignIn
 *         component={GoogleLogin}
 *         onSuccess={async ({ idToken }) => {
 *             await api.post("/auth/google", { body: { id_token: idToken } });
 *         }}
 *         onError={(err) => toast.error(err.message)}
 *     />
 * </GoogleOAuthProvider>
 */
export function GoogleSignIn({
    component: Component,
    onSuccess,
    onError,
    locale,
    theme,
    text,
    shape,
    size,
    disableOneTap,
    width,
    className,
    style,
}: GoogleSignInProps) {
    return (
        <div className={className} style={style}>
            {Component({
                onSuccess: (response: { credential?: string }) => {
                    if (!response.credential) {
                        onError?.({
                            provider: "google",
                            message: "Google returned no credential",
                            raw: response,
                        });
                        return;
                    }
                    return onSuccess({
                        idToken: response.credential,
                        provider: "google",
                        raw: response,
                    });
                },
                onError: () => {
                    onError?.({
                        provider: "google",
                        message: "Google login failed",
                    });
                },
                locale,
                theme,
                text,
                shape,
                size,
                useOneTap: !disableOneTap,
                width,
            })}
        </div>
    );
}
