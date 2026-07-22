export const BASE_GUESS_SCORE = 100

export function guessScore(firstCorrectGuess: boolean, turnEndsAt: number | undefined, turnSeconds: number, now = Date.now()) {
  if (!firstCorrectGuess || typeof turnEndsAt !== 'number') return BASE_GUESS_SCORE
  const secondsRemaining = Math.min(turnSeconds, Math.max(0, Math.ceil((turnEndsAt - now) / 1000)))
  return BASE_GUESS_SCORE + secondsRemaining
}
