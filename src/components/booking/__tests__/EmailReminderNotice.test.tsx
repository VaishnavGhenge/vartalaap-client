import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmailReminderNotice } from "@/src/components/booking/EmailReminderNotice";

const now = "2026-09-13T10:00:00Z";

describe("EmailReminderNotice", () => {
    it("shows both reminders when both can still be scheduled", () => {
        render(<EmailReminderNotice startsAt="2026-09-15T10:00:00Z" currentAt={now} />);
        expect(screen.getByText(/24 hours and 1 hour/)).toBeInTheDocument();
    });

    it("shows only the remaining reminder inside 24 hours", () => {
        render(<EmailReminderNotice startsAt="2026-09-13T12:00:00Z" currentAt={now} />);
        expect(screen.getByText(/1-hour email reminder/)).toBeInTheDocument();
    });

    it("does not promise a reminder after the scheduling window", () => {
        const { container } = render(
            <EmailReminderNotice startsAt="2026-09-13T10:30:00Z" currentAt={now} />,
        );
        expect(container).toBeEmptyDOMElement();
    });
});
