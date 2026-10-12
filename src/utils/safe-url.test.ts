import { describe, expect, it } from "vitest";

import { safeAttachmentUrl, safeImageUrl, safeLinkUrl } from "./safe-url";

describe("safeLinkUrl", () => {
    it("keeps the schemes a link may use", () => {
        for (const url of [
            "https://tempest.dev/x?a=1#b",
            "http://localhost:5173",
            "mailto:alguem@exemplo.com",
            "tel:+5511999999999",
            "sms:+5511999999999",
        ]) {
            expect(safeLinkUrl(url)).toBe(url);
        }
    });

    it("keeps relative URLs — they cannot carry a scheme", () => {
        for (const url of ["/docs", "./x", "../y", "#ancora", "foo/bar", "//cdn.exemplo.com/a"]) {
            expect(safeLinkUrl(url)).toBe(url);
        }
    });

    it("drops javascript:, however it is spelled", () => {
        // A blocklist would have to know every one of these. The allowlist does not.
        const attempts = [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "  javascript:alert(1)",
            `java${String.fromCharCode(9)}script:alert(1)`,
            `java${String.fromCharCode(10)}script:alert(1)`,
            `${String.fromCharCode(1)}javascript:alert(1)`,
        ];
        for (const url of attempts) {
            expect(safeLinkUrl(url)).toBeNull();
        }
    });

    it("drops the other executable schemes", () => {
        for (const url of [
            "vbscript:msgbox(1)",
            "data:text/html,<script>x</script>",
            "file:///etc/passwd",
        ]) {
            expect(safeLinkUrl(url)).toBeNull();
        }
    });

    it("drops an empty URL", () => {
        expect(safeLinkUrl("")).toBeNull();
        expect(safeLinkUrl("   ")).toBeNull();
    });
});

describe("safeImageUrl", () => {
    it("keeps http(s) and relative sources", () => {
        expect(safeImageUrl("https://exemplo.com/a.png")).toBe("https://exemplo.com/a.png");
        expect(safeImageUrl("/assets/a.png")).toBe("/assets/a.png");
    });

    it("keeps a base64 raster data URL", () => {
        const url = "data:image/png;base64,iVBORw0KGgo=";
        expect(safeImageUrl(url)).toBe(url);
    });

    it("drops data:image/svg+xml — an SVG is a document that can carry script", () => {
        expect(safeImageUrl("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=")).toBeNull();
        expect(safeImageUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    });

    it("drops any other data: type", () => {
        expect(safeImageUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
        expect(safeImageUrl("data:application/javascript,alert(1)")).toBeNull();
    });

    it("drops javascript: in a src too", () => {
        expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    });
});

describe("safeAttachmentUrl (#447)", () => {
    it.each([
        "https://cdn.x.dev/a.pdf",
        "http://x.dev/a.pdf",
        "blob:https://app.x.dev/4f1c-9a2e",
        "/files/a.pdf",
        "files/a.pdf",
        "//cdn.x.dev/a.pdf",
        "data:image/png;base64,iVBORw0KGgo=",
    ])("keeps %j", (url) => {
        expect(safeAttachmentUrl(url)).toBe(url);
    });

    it.each([
        'javascript:document.title="x"',
        "JaVaScRiPt:alert(1)",
        "java\tscript:alert(1)",
        "\u0001javascript:alert(1)",
        " javascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html,<script>alert(1)</script>",
        "data:image/svg+xml;base64,PHN2Zz4=",
        "mailto:a@x.dev",
        "file:///etc/passwd",
        "",
        "   ",
    ])("rejects %j", (url) => {
        expect(safeAttachmentUrl(url)).toBeNull();
    });

    it("returns the URL as given, so a space in a file name survives", () => {
        expect(safeAttachmentUrl("/files/relatório final.pdf")).toBe("/files/relatório final.pdf");
    });
});
