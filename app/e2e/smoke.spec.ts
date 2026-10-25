import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Every page opens, the main flow on it works, and nothing white-screens: no uncaught error, no console
 * error, no error-boundary fallback, and no serious accessibility violation (axe, WCAG 2.1 AA).
 */

function watch(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // A failed request logs "Failed to load resource" (the tutor answers 503 without a Claude key): the
    // page must handle it, which the assertions below check, so the log line itself is not a bug.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
  })
  return errors
}

async function healthy(page: Page, errors: string[]) {
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.getByText('Something went wrong on this page')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

async function signIn(page: Page, role: 'Reviewer' | 'Admin') {
  await expect(page.getByText('e2e-demo-pass')).toBeVisible() // the demo password arrived from the API
  const fill = page.getByRole('button', { name: 'Fill in' })
  const email = page.getByRole('textbox', { name: 'Email' })
  // Reviewer is listed first, Admin last; click until the form is really filled (it may re-render once).
  await expect(async () => {
    await (role === 'Reviewer' ? fill.first() : fill.last()).click()
    await expect(email).toHaveValue(`${role.toLowerCase()}@sahpaathi.test`, { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('e2e-demo-pass')).toHaveCount(0, { timeout: 30_000 }) // signed in (scrypt is slow on CI)
}

/** Opens a sidebar section; on phones the sidebar lives behind the menu button. */
async function goTo(page: Page, section: string) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  const phone = await menu.isVisible()
  if (phone) await menu.click()
  await page.getByRole('button', { name: section }).first().click()
  if (phone) await expect(page.getByRole('dialog')).toHaveCount(0) // the sheet has finished closing
}

test('landing page, with its scroll motion', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('second teacher')
  await page.getByRole('button', { name: 'Few got it' }).click()
  await page.mouse.wheel(0, 4000)
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(errors, errors.join('\n')).toEqual([])
})

test.describe('landing page, settled', () => {
  // Scroll reveals fade text in from low opacity, which axe reads as low contrast mid-animation. With
  // reduced motion everything is in its final state, so the colours themselves are what is checked.
  test.use({ reducedMotion: 'reduce' })
  test('is accessible', async ({ page }) => {
    const errors = watch(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('second teacher')
    await healthy(page, errors)
  })
})

test('teacher plays the built-in lesson offline-first', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/teacher')
  await page.getByRole('button', { name: 'Open lesson' }).click()
  await page.getByRole('button', { name: 'Start lesson' }).click()
  await expect(page.getByText(/Part 1 of/)).toBeVisible()
  await healthy(page, errors)
})

test('teacher: the Plan and Shelf tabs open and are accessible', async ({ page }) => {
  // The tabs fade in over half a second; axe would measure the text mid-fade, when it is half transparent.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = watch(page)
  await page.goto('/teacher')
  await page.getByRole('button', { name: 'Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Plan and record' })).toBeVisible()
  await page.getByRole('button', { name: /Maths/ }).click()
  await expect(page.getByRole('tab', { name: /Grade 1/ })).toBeVisible()
  await healthy(page, errors)
  await page.getByRole('button', { name: 'Shelf' }).click()
  await expect(page.getByRole('heading', { name: 'Books, notes and recordings' })).toBeVisible()
  await expect(page.getByRole('link', { name: /NCERT textbooks/ })).toBeVisible()
  await healthy(page, errors)
  await page.getByRole('tab', { name: 'My recordings' }).click()
  await expect(page.getByText(/No recordings yet/)).toBeVisible()
  await healthy(page, errors)
})

test('studio: a reviewer signs in and opens a lesson', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/studio')
  await signIn(page, 'Reviewer')
  await page
    .getByRole('button', { name: /chennai/i })
    .first()
    .click()
  await expect(page.getByLabel('AI review')).toBeVisible()
  await healthy(page, errors)
})

test('admin: overview and class health', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/admin')
  await signIn(page, 'Admin')
  await expect(page.getByText('Lesson pipeline')).toBeVisible()
  await goTo(page, 'Classes')
  await expect(page.getByRole('button', { name: 'Load sample classrooms' })).toBeVisible()
  await healthy(page, errors)
})

test('tutor: sending a message never blanks the page', async ({ page }) => {
  const errors = watch(page)
  await page.goto('/tutor')
  await page.getByRole('textbox', { name: 'Type a message' }).fill('what is 2 plus 3?')
  await page.keyboard.press('Enter')
  // Without a Claude key the server says the tutor is not set up; with one, the teacher answers.
  await expect(page.getByText(/not set up yet|could not answer|\b5\b|five/i).first()).toBeVisible({ timeout: 30_000 })
  await healthy(page, errors)
})
