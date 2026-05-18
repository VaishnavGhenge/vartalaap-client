import { expect, test, type Page } from '@playwright/test'
import { createCallContexts, joinRoom, createRoom, type InitScriptTarget } from './helpers/call'

async function installDocumentPipStub(
  target: InitScriptTarget,
  options: {
    // Simulates Arc's behaviour: when the host page loses focus (tab switch),
    // Arc closes the Document PiP window by dispatching pagehide on it.
    // Standard Chrome does NOT do this — the window floats across all tabs.
    closeOnBlur?: boolean
    pageHideTarget?: 'window' | 'document'
    // Some Arc paths appear to drop documentPictureInPicture.window without
    // delivering pagehide to the app listener.
    dropWindowOnBlurWithoutPagehide?: boolean
    hideDocumentOnBlurWithoutPagehide?: boolean
  } = {},
) {
  await target.addInitScript(({ closeOnBlur, pageHideTarget, dropWindowOnBlurWithoutPagehide, hideDocumentOnBlurWithoutPagehide }) => {
    const state = {
      requestCount: 0,
      closeCount: 0,
      pageHideCount: 0,
      active: false,
      documentVisibility: 'visible',
      lastOptions: null as unknown,
      win: null as Window | null,
    }

    ;(window as unknown as { __pipState: typeof state }).__pipState = state

    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        get window() { return state.win },
        async requestWindow(opts?: { width?: number; height?: number; preferInitialWindowPlacement?: boolean }) {
          state.requestCount++
          state.lastOptions = opts ?? null
          state.active = true

          const pipDoc = document.implementation.createHTMLDocument('pip')
          const listeners = new Map<string, EventListener>()
          const pipWin = {
            document: pipDoc,
            closed: false as boolean,
            addEventListener(type: string, listener: EventListener) {
              listeners.set(type, listener)
            },
            removeEventListener(type: string, listener: EventListener) {
              if (listeners.get(type) === listener) listeners.delete(type)
            },
            __dispatchPageHide(target: 'window' | 'document' = pageHideTarget ?? 'window') {
              state.pageHideCount++
              ;(this as unknown as { closed: boolean }).closed = true
              state.active = false
              state.win = null
              if (target === 'document') {
                pipDoc.dispatchEvent(new Event('pagehide'))
              } else {
                listeners.get('pagehide')?.call(this as unknown as Window, new Event('pagehide'))
              }
            },
            close() {
              state.closeCount++
              ;(this as unknown as { __dispatchPageHide: () => void }).__dispatchPageHide()
            },
          } as unknown as Window

          state.win = pipWin

          Object.defineProperty(pipDoc, 'visibilityState', {
            configurable: true,
            get() { return state.documentVisibility },
          })

          if (closeOnBlur) {
            // Arc closes the Document PiP window whenever the user switches tabs.
            // We simulate this by dispatching pagehide on the pip window the
            // moment the host page fires blur.
            const onBlur = () => {
              const w = state.win as unknown as { __dispatchPageHide?: () => void } | null
              w?.__dispatchPageHide?.()
            }
            window.addEventListener('blur', onBlur, { once: true })
          }

          if (dropWindowOnBlurWithoutPagehide) {
            const onBlur = () => {
              ;(pipWin as unknown as { closed: boolean }).closed = true
              state.active = false
              state.win = null
            }
            window.addEventListener('blur', onBlur, { once: true })
          }

          if (hideDocumentOnBlurWithoutPagehide) {
            const onBlur = () => {
              state.documentVisibility = 'hidden'
              pipDoc.dispatchEvent(new Event('visibilitychange'))
            }
            window.addEventListener('blur', onBlur, { once: true })
          }

          return pipWin
        },
      },
    })
  }, options)
}

async function installElementPipStub(
  target: InitScriptTarget,
  options: { dropElementOnBlurWithoutLeave?: boolean } = {},
) {
  await target.addInitScript(({ dropElementOnBlurWithoutLeave }) => {
    const state = {
      requestCount: 0,
      exitCount: 0,
      active: false,
      element: null as HTMLVideoElement | null,
    }

    ;(window as unknown as { __elementPipState: typeof state }).__elementPipState = state

    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get() { return state.element },
    })

    HTMLVideoElement.prototype.requestPictureInPicture = async function () {
      state.requestCount++
      state.active = true
      state.element = this

      if (dropElementOnBlurWithoutLeave) {
        const onBlur = () => {
          state.active = false
          state.element = null
        }
        window.addEventListener('blur', onBlur, { once: true })
      }

      return {} as PictureInPictureWindow
    }

    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: async () => {
        const element = state.element
        state.exitCount++
        state.active = false
        state.element = null
        element?.dispatchEvent(new Event('leavepictureinpicture'))
      },
    })
  }, options)
}

async function ensureVideoElement(page: Page) {
  const cameraOnButton = page.getByRole('button', { name: /turn camera on/i })
  if (await cameraOnButton.isVisible().catch(() => false)) {
    await cameraOnButton.click()
  }
  await expect(page.locator('video').first()).toBeVisible({ timeout: 5_000 })
}

async function installScreenShareStub(target: InitScriptTarget, options: { reject?: boolean } = {}) {
  await target.addInitScript(({ reject }) => {
    const state = {
      requestCount: 0,
      stopCount: 0,
      lastConstraints: null as unknown,
    }

    ;(window as unknown as { __screenShareState: typeof state }).__screenShareState = state

    const mediaDevices = navigator.mediaDevices ?? {}
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    })

    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async (constraints?: DisplayMediaStreamOptions) => {
        state.requestCount++
        state.lastConstraints = constraints ?? null

        if (reject) {
          throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
        }

        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 180
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#0f766e'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        const stream = canvas.captureStream(5)
        const track = stream.getVideoTracks()[0]
        const stop = track.stop.bind(track)
        track.stop = () => {
          state.stopCount++
          stop()
        }
        return stream
      },
    })
  }, options)
}

test.describe('In-call feature controls', () => {
  test('PiP stays on screen across tab switches — user can always re-enter without confusion', async ({ page }) => {
    // Arc closes Document PiP windows when the user switches tabs (blur → pagehide
    // on the pip window). The PiP content disappears mid-call with no feedback.
    //
    // Required behaviour: on return to the call tab the button must show
    // "Picture-in-picture" (not the stuck "Close") so the user can immediately
    // click to re-enter. PiP must never be silently gone.
    //
    // This test FAILS without a pagehide listener in use-pip.ts because the
    // button stays "Close picture-in-picture" after Arc closes the window.
    await installDocumentPipStub(page, { closeOnBlur: true })
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() =>
      (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    )
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    // Arc fires blur on the host page when the user switches tabs, which
    // causes Arc to close the Document PiP window (pagehide on the pip window).
    // We dispatch blur directly — bringToFront() does not reliably fire blur
    // across pages in headless Chromium.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))

    // State must reset — "Picture-in-picture" = user can re-enter immediately
    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })

    // User re-enters PiP — must open a fresh window, not be a no-op
    await page.getByRole('button', { name: 'Picture-in-picture' }).click()
    await page.waitForFunction(() =>
      (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 2
    )
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()
  })

  test('PiP is not closed when the page blurs without the pip window closing', async ({ page }) => {
    // Standard Chrome keeps the Document PiP window floating across all tabs.
    // Our code must not close pip just because the host page fires blur — only
    // a pagehide event on the pip window itself should trigger state reset.
    await installDocumentPipStub(page)   // no closeOnBlur — normal Chrome behaviour
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() =>
      (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    )
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    // Simulate blur + visibilitychange without closing the pip window
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // PiP must remain active — button must still say "Close picture-in-picture"
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()
    expect(
      await page.evaluate(() =>
        (window as unknown as { __pipState: { active: boolean } }).__pipState.active
      )
    ).toBe(true)
  })

  test('PiP button deactivates when the browser closes the pip window externally', async ({ page }) => {
    // Bug: Arc (and other browsers) close the Document PiP window when the user
    // switches tabs. The app never registered a pagehide listener on the pip
    // window, so React state is never updated — the button stays "Close
    // picture-in-picture" even though no pip window exists. The user cannot
    // re-enter pip without leaving and rejoining the call.
    //
    // Expected: dispatching pagehide on the pip window deactivates the button.
    await installDocumentPipStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    // Open PiP
    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()
    await expect.poll(() =>
      page.evaluate(() =>
        (window as unknown as { __pipState: { lastOptions: { width?: number; height?: number } | null } })
          .__pipState.lastOptions
      )
    ).toMatchObject({ width: 480, height: 270 })

    // Simulate the browser closing the pip window externally (Arc on tab switch)
    await page.evaluate(() => {
      const pipWin = window.documentPictureInPicture?.window as unknown as
        { __dispatchPageHide?: () => void } | null
      pipWin?.__dispatchPageHide?.()
    })

    // The button must revert to inactive — this FAILS without a pagehide listener in use-pip.ts
    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('button', { name: 'Close picture-in-picture' })).not.toBeVisible()
  })

  test('PiP button deactivates when the pip window disappears without pagehide', async ({ page }) => {
    await installDocumentPipStub(page, { dropWindowOnBlurWithoutPagehide: true })
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
    })

    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })
  })

  test('PiP button deactivates when pagehide fires on the pip document', async ({ page }) => {
    await installDocumentPipStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    await page.evaluate(() => {
      const pipWin = window.documentPictureInPicture?.window as unknown as
        { __dispatchPageHide?: (target?: 'window' | 'document') => void } | null
      pipWin?.__dispatchPageHide?.('document')
    })

    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })
  })

  test('PiP button deactivates when the pip document becomes hidden', async ({ page }) => {
    await installDocumentPipStub(page, { hideDocumentOnBlurWithoutPagehide: true })
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new Event('blur')))

    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })
  })

  test('element PiP can be re-entered when the floating video disappears without leave event', async ({ page }) => {
    await installElementPipStub(page, { dropElementOnBlurWithoutLeave: true })
    await joinRoom(page, await createRoom(), 'Alice')
    await ensureVideoElement(page)

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __elementPipState: { requestCount: number } }).__elementPipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
    })

    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })

    await page.getByRole('button', { name: 'Picture-in-picture' }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __elementPipState: { requestCount: number } }).__elementPipState.requestCount === 2
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()
  })

  test('PiP can be re-entered after the browser closes the window externally', async ({ page }) => {
    // Once the pagehide listener resets state, the user must be able to click
    // the button again to open a new pip window.
    await installDocumentPipStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    // Browser closes the window
    await page.evaluate(() => {
      const pipWin = window.documentPictureInPicture?.window as unknown as
        { __dispatchPageHide?: () => void } | null
      pipWin?.__dispatchPageHide?.()
    })

    // Wait for deactivation
    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible({ timeout: 3_000 })

    // User clicks again — must open a second pip window, not no-op
    await page.getByRole('button', { name: 'Picture-in-picture' }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 2
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()
  })

  test('explicit exit PiP button still works', async ({ page }) => {
    await installDocumentPipStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /picture-in-picture/i }).click()
    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { requestCount: number } }).__pipState.requestCount === 1
    })
    await expect(page.getByRole('button', { name: /close picture-in-picture/i })).toBeVisible()

    await page.getByRole('button', { name: /close picture-in-picture/i }).click()

    await page.waitForFunction(() => {
      return (window as unknown as { __pipState: { closeCount: number } }).__pipState.closeCount === 1
    })
    await expect(page.getByRole('button', { name: 'Picture-in-picture' })).toBeVisible()
  })

  test('screen sharing shows presenting state and can be stopped', async ({ page }) => {
    await installScreenShareStub(page)
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /share screen/i }).click()

    await page.waitForFunction(() => {
      return (window as unknown as { __screenShareState: { requestCount: number } }).__screenShareState.requestCount === 1
    })
    await expect(page.getByText(/presenting/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /stop sharing screen/i })).toBeVisible()

    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as unknown as {
          __screenShareState: { lastConstraints: DisplayMediaStreamOptions | null }
        }).__screenShareState.lastConstraints
      })
    }).toMatchObject({ video: true, audio: false, selfBrowserSurface: 'exclude' })

    await page.getByRole('button', { name: /stop sharing screen/i }).click()

    await expect(page.getByText(/presenting/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^share screen$/i })).toBeVisible()
    await expect.poll(async () => {
      return page.evaluate(() => {
        return (window as unknown as { __screenShareState: { stopCount: number } }).__screenShareState.stopCount
      })
    }).toBeGreaterThanOrEqual(1)
  })

  test('screen-share cancellation leaves the call in normal state', async ({ page }) => {
    await installScreenShareStub(page, { reject: true })
    await joinRoom(page, await createRoom(), 'Alice')

    await page.getByRole('button', { name: /share screen/i }).click()

    await page.waitForFunction(() => {
      return (window as unknown as { __screenShareState: { requestCount: number } }).__screenShareState.requestCount === 1
    })
    await expect(page.getByText(/presenting/i)).not.toBeVisible()
    await expect(page.getByRole('button', { name: /^share screen$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /leave call/i })).toBeVisible()
  })

  test('remote participant sees when a peer starts screen sharing', async ({ browser }) => {
    const roomCode = await createRoom()
    const { ctx1: aliceContext, ctx2: bobContext } = await createCallContexts(browser)
    await installScreenShareStub(aliceContext)

    const alice = await aliceContext.newPage()
    const bob = await bobContext.newPage()

    await joinRoom(alice, roomCode, 'Alice')
    await joinRoom(bob, roomCode, 'Bob')
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })

    await alice.getByRole('button', { name: /share screen/i }).click()

    await expect(bob.getByText(/Alice.*Screen/i)).toBeVisible({ timeout: 15_000 })

    await aliceContext.close()
    await bobContext.close()
  })
})
