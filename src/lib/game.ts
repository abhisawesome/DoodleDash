export const MAX_PLAYERS = 20
export const RECONNECT_GRACE_MS = 15_000

export type GamePhase = 'lobby' | 'choosing' | 'drawing' | 'turn-results' | 'game-results'
export type Player = { id: string; name: string; avatar: number; score: number; connected: boolean; guessed: boolean; spectator: boolean }
export type StrokePoint = { x: number; y: number }
export type Stroke = { id: string; color: string; width: number; points: StrokePoint[]; erased?: boolean }
export type ChatMessage = { id: string; playerId?: string; playerName?: string; text: string; kind: 'chat' | 'system' | 'correct'; at: number }
export type Settings = { rounds: number; turnSeconds: number; customWords: string[]; customOnly: boolean; hints: boolean }
export type GameState = {
  roomCode: string; hostId: string; creatorId?: string; phase: GamePhase; players: Player[]; settings: Settings;
  round: number; artistIndex: number; artistId?: string; word?: string; choices: string[];
  maskedWord: string; turnEndsAt?: number; strokes: Stroke[]; chat: ChatMessage[];
}

export const DEFAULT_SETTINGS: Settings = { rounds: 3, turnSeconds: 80, customWords: [], customOnly: false, hints: true }

export function fixedGuessScore() { return 100 }
export function fixedArtistScore(correctGuessers: number) { return correctGuessers * 50 }

export function maskWord(word: string, revealed: number[] = []) {
  return [...word].map((letter, index) => letter === ' ' ? ' ' : revealed.includes(index) ? letter.toUpperCase() : '_').join(' ')
}

export function normalizeGuess(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function isCorrectGuess(guess: string, word: string) { return normalizeGuess(guess) === normalizeGuess(word) }

export function nextTurn(state: GameState): Pick<GameState, 'round' | 'artistIndex' | 'phase'> {
  const active = state.players.filter((p) => !p.spectator)
  if (!active.length) return { round: state.round, artistIndex: 0, phase: 'lobby' }
  const nextIndex = state.artistIndex + 1
  if (nextIndex < active.length) return { round: state.round, artistIndex: nextIndex, phase: 'choosing' }
  if (state.round < state.settings.rounds) return { round: state.round + 1, artistIndex: 0, phase: 'choosing' }
  return { round: state.round, artistIndex: state.artistIndex, phase: 'game-results' }
}

export const BUILT_IN_WORDS = [
  'airplane','alarm clock','apple','backpack','banana','beach','bicycle','birthday cake','book','bridge',
  'butterfly','camera','candle','castle','cat','cloud','computer','crown','dog','dragon','drum','elephant',
  'fire truck','flower','football','guitar','hamburger','helicopter','ice cream','island','key','kite','ladder',
  'lighthouse','moon','mountain','octopus','panda','pencil','pizza','rainbow','rocket','sandcastle','shark',
  'snowman','spider','star','sunflower','telescope','train','tree house','umbrella','volcano','watermelon'
]

export function chooseWords(settings: Settings, count = 3) {
  const custom = settings.customWords.map(normalizeGuess).filter(Boolean)
  const pool = settings.customOnly && custom.length >= count ? custom : [...BUILT_IN_WORDS, ...custom]
  return [...new Set(pool)].sort(() => Math.random() - 0.5).slice(0, count)
}
