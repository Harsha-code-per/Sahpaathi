import { describe, expect, it, vi } from 'vitest'
import { uuid } from './utils'

describe('uuid', () => {
  it('makes a v4 UUID even where crypto.randomUUID is missing (old Android WebViews)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const id = uuid()
    vi.unstubAllGlobals()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
