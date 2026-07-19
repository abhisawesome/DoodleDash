import { test, expect } from '@playwright/test'
test('creates a room from the home screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'DoodleDash' })).toBeVisible()
  await page.getByLabel('Your nickname').fill('Panda')
  await page.getByRole('button', { name: /create a room/i }).click()
  await expect(page).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{6}/)
})
