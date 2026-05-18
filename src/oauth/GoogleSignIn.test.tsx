import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleSignIn } from "./GoogleSignIn";

describe("GoogleSignIn", () => {
    it("normalises onSuccess into an OAuthCredential", () => {
        const onSuccess = vi.fn();
        const FakeGoogleLogin = vi.fn(
            (props: { onSuccess?: (r: { credential: string }) => void }) => {
                props.onSuccess?.({ credential: "JWT.payload" });
                return null;
            },
        );
        render(<GoogleSignIn component={FakeGoogleLogin} onSuccess={onSuccess} />);
        expect(onSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
                idToken: "JWT.payload",
                provider: "google",
            }),
        );
    });

    it("normalises Google errors into OAuthError", () => {
        const onError = vi.fn();
        const FakeGoogleLogin = vi.fn((props: { onError?: () => void }) => {
            props.onError?.();
            return null;
        });
        render(<GoogleSignIn component={FakeGoogleLogin} onSuccess={() => {}} onError={onError} />);
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: "google",
                message: "Google login failed",
            }),
        );
    });

    it("reports an OAuthError when credential is missing", () => {
        const onError = vi.fn();
        const FakeGoogleLogin = vi.fn((props: { onSuccess?: (r: object) => void }) => {
            props.onSuccess?.({});
            return null;
        });
        render(<GoogleSignIn component={FakeGoogleLogin} onSuccess={() => {}} onError={onError} />);
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: "google",
                message: expect.stringContaining("no credential"),
            }),
        );
    });
});
