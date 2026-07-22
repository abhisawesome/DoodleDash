import { describe, expect, it } from 'vitest'
import { BUILT_IN_WORDS, DEFAULT_SETTINGS, MAX_PLAYERS, chooseWords, fixedArtistScore, fixedGuessScore, isCorrectGuess, maskWord, nextTurn, normalizeGuess, type GameState } from './game'

describe('game rules', () => {
  it('provides a unique curated vocabulary large enough for a maximum-size game', () => {
    expect(BUILT_IN_WORDS.length).toBeGreaterThan(1000)
    expect(new Set(BUILT_IN_WORDS)).toHaveLength(BUILT_IN_WORDS.length)
    expect(BUILT_IN_WORDS.length).toBeGreaterThanOrEqual(MAX_PLAYERS * 5 * 3)
  })
  it('excludes adult, hateful, graphic, and otherwise sensitive supplied prompts', () => {
    const excluded = [
      'sexoffender', 'transgender', 'stalker', 'doodshoofd', 'assassin', 'assault',
      'corpse', 'cigarette', 'communism', 'crack', 'dead', 'depressed', 'divorce',
      'murderer', 'pregnant', 'religion', 'sniper', 'stoned', 'tampon', 'thug',
      'tumor', 'victim', 'violence', 'vodka', 'weapon',
    ]
    expect(excluded.filter((word) => BUILT_IN_WORDS.includes(word as never))).toEqual([])
  })
  it('normalizes fair guesses', () => { expect(normalizeGuess('  ICE   Cream ')).toBe('icecream'); expect(isCorrectGuess('Ice Cream', 'ice-cream')).toBe(true); expect(isCorrectGuess('cafe', 'café')).toBe(true) })
  it('uses the base guess score and rewards the artist for each correct guesser', () => { expect(fixedGuessScore()).toBe(100); expect(fixedArtistScore(3)).toBe(150) })
  it('masks letters while preserving spaces', () => { expect(maskWord('ice cream')).toBe('_ _ _   _ _ _ _ _'); expect(maskWord('cat', [1])).toBe('_ A _') })
  it('advances through players, rounds, and results', () => {
    const state = { players: [{ id: 'a', spectator: false }, { id: 'b', spectator: false }], artistIndex: 0, round: 1, settings: { rounds: 2 } } as GameState
    expect(nextTurn(state)).toMatchObject({ artistIndex: 1, round: 1, phase: 'choosing' })
    expect(nextTurn({ ...state, artistIndex: 1 })).toMatchObject({ artistIndex: 0, round: 2 })
    expect(nextTurn({ ...state, artistIndex: 1, round: 2 }).phase).toBe('game-results')
  })
  it('offers unseen words before repeating used words', () => {
    const choices = chooseWords(DEFAULT_SETTINGS, 3, BUILT_IN_WORDS.slice(0, -3))
    expect(new Set(choices)).toEqual(new Set(BUILT_IN_WORDS.slice(-3)))
  })
})
