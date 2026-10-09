/** Steps in a lobby the browser scripts share. */
import type { Page } from 'playwright-core'

/** Adds a computer to each of the first `n` empty seats, one tap each, waiting for each to sit before the next. */
export async function addComputers(page: Page, n: number): Promise<void> {
  const add = page.getByRole('button', { name: 'Add computer' })
  for (let i = 0; i < n; i++) {
    // The buttons show once the host's seat arrives; count them only then.
    await add.first().waitFor()
    const before = await add.count()
    await add.first().click()
    for (let wait = 0; wait < 50 && (await add.count()) === before; wait++) await page.waitForTimeout(100)
  }
}
