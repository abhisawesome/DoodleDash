import { describe, expect, it } from 'vitest'
import { fixedArtistScore, fixedGuessScore, isCorrectGuess, maskWord, nextTurn, normalizeGuess, type GameState } from './game'

describe('game rules', () => {
  it('normalizes fair guesses', () => { expect(normalizeGuess('  ICE   Cream ')).toBe('ice cream'); expect(isCorrectGuess('Ice Cream', 'ice cream')).toBe(true) })
  it('uses the selected fixed scoring rules', () => { expect(fixedGuessScore()).toBe(100); expect(fixedArtistScore(3)).toBe(150) })
  it('masks letters while preserving spaces', () => { expect(maskWord('ice cream')).toBe('_ _ _   _ _ _ _ _'); expect(maskWord('cat', [1])).toBe('_ A _') })
  it('advances through players, rounds, and results', () => {
    const state = { players: [{ id: 'a', spectator: false }, { id: 'b', spectator: false }], artistIndex: 0, round: 1, settings: { rounds: 2 } } as GameState
    expect(nextTurn(state)).toMatchObject({ artistIndex: 1, round: 1, phase: 'choosing' })
    expect(nextTurn({ ...state, artistIndex: 1 })).toMatchObject({ artistIndex: 0, round: 2 })
    expect(nextTurn({ ...state, artistIndex: 1, round: 2 }).phase).toBe('game-results')
  })
})
