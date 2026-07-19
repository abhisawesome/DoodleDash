import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function makeRoomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function playerId() {
  const saved = sessionStorage.getItem('doodledash-player-id')
  if (saved) return saved
  const id = crypto.randomUUID()
  sessionStorage.setItem('doodledash-player-id', id)
  return id
}
