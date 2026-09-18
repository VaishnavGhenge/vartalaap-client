import { afterEach, describe, expect, it, vi } from 'vitest'

import { listSlots, rescheduleBookingByMeetCode } from '../public'

function okJson(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    }
}

describe('public rescheduling API', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('authorizes the slot view with the manage-link credential', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ slots: [] })))

        await listSlots('alex', 'intro', '2026-09-14', '2026-09-21', {
            code: 'abc-defg-hij',
            token: 'secret token',
        })

        const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
        expect(url.pathname).toBe('/u/alex/intro/slots')
        expect(url.searchParams.get('reschedule')).toBe('abc-defg-hij')
        expect(url.searchParams.get('t')).toBe('secret token')
    })

    it('moves the existing booking instead of creating a second one', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ id: 'booking-1' })))

        await rescheduleBookingByMeetCode(
            'abc-defg-hij',
            'manage-token',
            '2026-09-14T10:00:00Z',
            'hold-token',
        )

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/m/abc-defg-hij?t=manage-token'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({
                    startsAt: '2026-09-14T10:00:00Z',
                    holdToken: 'hold-token',
                }),
            }),
        )
    })
})
