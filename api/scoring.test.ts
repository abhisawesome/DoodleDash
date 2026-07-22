import { describe, expect, it } from 'vitest'
import { guessScore } from './scoring'

describe('guess scoring', () => {
  it('gives later correct guessers the base score', () => {
    expect(guessScore(false, 80_000, 80, 0)).toBe(100)
  })

  it('rewards the first correct guess based on the remaining time', () => {
    expect(guessScore(true, 80_000, 80, 20_000)).toBe(160)
    expect(guessScore(true, 80_000, 80, 79_500)).toBe(101)
  })

  it('caps the time bonus at the configured turn length', () => {
    expect(guessScore(true, 200_000, 80, 0)).toBe(180)
  })
})
