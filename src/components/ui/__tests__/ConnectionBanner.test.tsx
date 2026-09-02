import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { ConnectionBanner } from '../ConnectionBanner'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('ConnectionBanner — connected', () => {
  it('renders nothing when connection is established', () => {
    const { container } = render(
      <ConnectionBanner connState="connected" reconnectAttempt={0} onLeave={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ConnectionBanner — reconnecting', () => {
  it('shows the amber reconnecting banner', () => {
    render(
      <ConnectionBanner connState="reconnecting" reconnectAttempt={2} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
  })

  it('displays the current attempt with no ceiling', () => {
    render(
      <ConnectionBanner connState="reconnecting" reconnectAttempt={9} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/attempt 9/i)).toBeInTheDocument()
    expect(screen.queryByText(/of \d/i)).not.toBeInTheDocument()
  })
})

describe('ConnectionBanner — failed', () => {
  it('shows the connection-lost overlay', () => {
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={vi.fn()} />
    )
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument()
  })

  // Ending the call for the user was the app giving up on their behalf. Leaving
  // is now theirs to choose; the client keeps retrying underneath.
  it('never leaves the call on its own', () => {
    const onLeave = vi.fn()
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={9} onLeave={onLeave} />
    )

    act(() => vi.advanceTimersByTime(60_000))

    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.getByText(/still trying to reconnect/i)).toBeInTheDocument()
  })

  it('calls onLeave immediately when the Leave now button is clicked', () => {
    const onLeave = vi.fn()
    render(
      <ConnectionBanner connState="failed" reconnectAttempt={5} onLeave={onLeave} />
    )

    fireEvent.click(screen.getByRole('button', { name: /leave now/i }))

    expect(onLeave).toHaveBeenCalledOnce()
  })
})
