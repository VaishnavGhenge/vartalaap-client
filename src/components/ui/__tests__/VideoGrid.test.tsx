import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGrid } from "../VideoGrid";

describe("VideoGrid media identity", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            width: 1000,
            height: 600,
        } as DOMRect);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    const tiles = (peers: string[]) => [
        <video key="local" data-testid="local" />,
        peers.map((id) => <video key={id} data-testid={id} />),
    ];

    it("preserves video elements when participants join, leave, or get pinned", () => {
        const { rerender } = render(<VideoGrid conversation>{tiles(["alice"])}</VideoGrid>);
        const local = screen.getByTestId("local");
        const alice = screen.getByTestId("alice");
        expect(alice.parentElement?.style.height).toBe("488px");
        expect(local.parentElement?.style.height).toBe("100px");
        rerender(
            <VideoGrid conversation focusKey="alice">
                {tiles(["alice", "bob"])}
            </VideoGrid>,
        );
        expect(screen.getByTestId("local")).toBe(local);
        expect(screen.getByTestId("alice")).toBe(alice);
        rerender(
            <VideoGrid conversation focusKey="local">
                {tiles(["alice"])}
            </VideoGrid>,
        );
        expect(screen.getByTestId("alice")).toBe(alice);
        expect(screen.getByTestId("local")).toBe(local);
    });

    it("centers an incomplete final row without remounting tiles", () => {
        render(<VideoGrid>{tiles(["alice", "bob"])}</VideoGrid>);
        const bob = screen.getByTestId("bob").parentElement!;
        expect(Number.parseFloat(bob.style.left)).toBeGreaterThan(0);
        expect(Number.parseFloat(bob.style.width)).toBeGreaterThan(0);
    });
});
