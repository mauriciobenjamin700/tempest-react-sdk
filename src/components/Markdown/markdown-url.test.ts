import { describe, expect, it } from "vitest";

import { safeImageUrl, safeLinkUrl } from "./markdown-url";

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
