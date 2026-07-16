import { describe, expect, it } from "vitest";
import { higherVersionWins, lastWriteWins } from "./conflict";

interface Rec {
    id: string;
    updatedAt: number | string;
    version: number;
    tag: string;
}

const local: Rec = { id: "1", updatedAt: 1000, version: 1, tag: "local" };
const remote: Rec = { id: "1", updatedAt: 2000, version: 2, tag: "remote" };

describe("lastWriteWins", () => {
    it("returns remote when local is undefined", () => {
        expect(lastWriteWins<Rec>(undefined, remote, (r) => r.updatedAt).tag).toBe("remote");
    });

    it("keeps the newer record", () => {
        expect(lastWriteWins(local, remote, (r) => r.updatedAt).tag).toBe("remote");
        expect(lastWriteWins(remote, local, (r) => r.updatedAt).tag).toBe("remote");
    });

    it("resolves ties to remote", () => {
        const tie: Rec = { ...local, updatedAt: 1000, tag: "remote-tie" };
        expect(lastWriteWins(local, tie, (r) => r.updatedAt).tag).toBe("remote-tie");
    });

    it("parses ISO string timestamps", () => {
        const a: Rec = { ...local, updatedAt: "2020-01-01T00:00:00Z", tag: "old" };
        const b: Rec = { ...remote, updatedAt: "2024-01-01T00:00:00Z", tag: "new" };
        expect(lastWriteWins(a, b, (r) => r.updatedAt).tag).toBe("new");
    });
});

describe("higherVersionWins", () => {
    it("returns remote when local is undefined", () => {
        expect(higherVersionWins<Rec>(undefined, remote, (r) => r.version).tag).toBe("remote");
    });

    it("keeps the higher version", () => {
        expect(higherVersionWins(local, remote, (r) => r.version).tag).toBe("remote");
        expect(higherVersionWins(remote, local, (r) => r.version).tag).toBe("remote");
    });

    it("resolves ties to remote", () => {
        const tie: Rec = { ...local, version: 1, tag: "remote-tie" };
        expect(higherVersionWins(local, tie, (r) => r.version).tag).toBe("remote-tie");
    });
});
