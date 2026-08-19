import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SetupChecklist, type SetupState } from '../SetupChecklist'

const base: SetupState = { profile: true, availability: true, eventType: true }

describe('SetupChecklist — calendar row', () => {
    // undefined means the deployment has no Google credentials, or the status
    // lookup failed. Either way the host cannot complete the step, so showing
    // it would be an unfixable task on their to-do list.
    it('omits the row when calendar sync does not apply', () => {
        render(<SetupChecklist state={{ ...base, calendar: undefined }} />)
        expect(screen.queryByText(/connect your calendar/i)).not.toBeInTheDocument()
    })

    it('shows the row as outstanding when connectable but not connected', () => {
        render(<SetupChecklist state={{ ...base, calendar: false }} />)
        expect(screen.getByText(/connect your calendar/i)).toBeInTheDocument()
        expect(screen.getByText(/can't book over meetings you already have/i)).toBeInTheDocument()
    })

    it('points the row at the panel that holds the connect control', () => {
        render(<SetupChecklist state={{ ...base, calendar: false }} />)
        const link = screen.getByRole('link', { name: /open/i })
        expect(link).toHaveAttribute('href', '/dashboard?panel=availability')
    })

    // Every step done, including calendar, collapses to the single completion
    // line rather than a list of four struck-through rows.
    it('reports setup complete once the calendar is connected too', () => {
        render(<SetupChecklist state={{ ...base, calendar: true }} />)
        expect(screen.getByText(/setup complete/i)).toBeInTheDocument()
        expect(screen.queryByText(/connect your calendar/i)).not.toBeInTheDocument()
    })

    // The three original steps are each required before a guest can book at
    // all. Calendar is not, so a connected calendar must not mask them.
    it('does not report complete when an earlier step is outstanding', () => {
        render(<SetupChecklist state={{ ...base, eventType: false, calendar: true }} />)
        expect(screen.queryByText(/setup complete/i)).not.toBeInTheDocument()
        expect(screen.getByText(/publish an event type/i)).toBeInTheDocument()
    })

    it('keeps calendar last so required steps come first', () => {
        render(<SetupChecklist state={{ profile: false, availability: false, eventType: false, calendar: false }} />)
        const titles = screen.getAllByText(
            /claim your booking url|set weekly availability|publish an event type|connect your calendar/i,
        ).map((el) => el.textContent)
        expect(titles[titles.length - 1]).toMatch(/connect your calendar/i)
    })

    // Pre-Phase-3 callers construct SetupState without a calendar key at all.
    it('behaves as before when the calendar field is absent', () => {
        render(<SetupChecklist state={base} />)
        expect(screen.getByText(/setup complete/i)).toBeInTheDocument()
    })
})
