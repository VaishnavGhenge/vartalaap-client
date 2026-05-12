import { test, expect, type Page } from '@playwright/test'
import { CALL_CONTEXT_OPTIONS, fillName, joinRoom, randomRoom } from './helpers/call'

async function expectRemoteVideoPlaying(page: Page) {
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('video')).some((video) => {
      const quality = video.getVideoPlaybackQuality?.()
      if (
        video.muted
        || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || video.videoWidth <= 16
        || video.videoHeight <= 16
        || (quality && quality.totalVideoFrames === 0)
      ) {
        return false
      }

      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) return true
      }
      return false
    })
  }, { timeout: 10_000 })
}

test.describe('Two-user call', () => {
  test('remote participant receives camera video after peer turns camera on', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const ctx2 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const alice = await ctx1.newPage()
    const bob = await ctx2.newPage()

    await test.step('both users join with cameras off', async () => {
      await joinRoom(alice, roomCode, 'Alice')
      await joinRoom(bob, roomCode, 'Bob')
      await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 })
      await expect(bob.getByText('Alice')).toBeVisible({ timeout: 15_000 })
      await expect(alice.getByText(/2 participants/i)).toBeVisible()
      await expect(bob.getByText(/2 participants/i)).toBeVisible()
      await expect(alice.getByText(/invite someone/i)).not.toBeVisible()
      await expect(bob.getByText(/invite someone/i)).not.toBeVisible()
    })

    await test.step('Alice turns camera on', async () => {
      await alice.getByRole('button', { name: /turn camera on/i }).click()
    })

    await test.step('Bob receives decoded remote video frames', async () => {
      await expectRemoteVideoPlaying(bob)
    })

    await ctx1.close()
    await ctx2.close()
  })

  test('a user who leaves is removed from the other user\'s view', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const ctx2 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('both users join', async () => {
      await joinRoom(page1, roomCode, 'Alice')
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await test.step('Bob leaves the call', async () => {
      await page2.getByRole('button', { name: /leave call/i }).click()
    })

    await test.step('Alice no longer sees Bob\'s tile', async () => {
      await expect(page1.getByText('Bob')).not.toBeVisible({ timeout: 10_000 })
    })

    await test.step('Alice is back to 1 participant', async () => {
      await expect(page1.getByText(/1 participant/i)).toBeVisible()
    })

    await ctx1.close()
    await ctx2.close()
  })

  test('rejoining the same room after leaving works', async ({ browser }) => {
    const roomCode = randomRoom()

    const ctx1 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const ctx2 = await browser.newContext(CALL_CONTEXT_OPTIONS)
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await test.step('Alice joins', async () => {
      await joinRoom(page1, roomCode, 'Alice')
    })

    await test.step('Alice leaves and rejoins', async () => {
      await page1.getByRole('button', { name: /leave call/i }).click()
      await expect(page1.getByRole('button', { name: /join now/i })).toBeVisible({ timeout: 5_000 })

      await fillName(page1, 'Alice')
      await page1.getByRole('button', { name: /join now/i }).click()
      await expect(page1.getByRole('button', { name: /leave call/i })).toBeVisible({ timeout: 10_000 })
    })

    await test.step('Bob joins and can see Alice', async () => {
      await joinRoom(page2, roomCode, 'Bob')
      await expect(page2.getByText('Alice')).toBeVisible({ timeout: 15_000 })
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 15_000 })
    })

    await ctx1.close()
    await ctx2.close()
  })
})
