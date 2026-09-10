import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConnectionBanner } from "../ConnectionBanner";

it("keeps the status region mounted through recovery and offers leaving without hiding video", () => {
    const onLeave = vi.fn();
    const { rerender } = render(<ConnectionBanner connState="connected" reconnectAttempt={0} onLeave={onLeave} />);
    const status = screen.getByRole("status");
    rerender(<ConnectionBanner connState="reconnecting" reconnectAttempt={1} onLeave={onLeave} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Trying to reconnect");
    rerender(<ConnectionBanner connState="failed" reconnectAttempt={2} onLeave={onLeave} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave call" }));
    expect(onLeave).toHaveBeenCalledOnce();
});
