import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function makeRoomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function playerId() {
  // sessionStorage is copied when a room is opened in a new tab, which used to
  // make both tabs impersonate the same player (and both see the word chooser).
  // window.name is tab-specific and survives reloads, so namespace the saved
  // player identity by a stable ID for this browser tab.
  const prefix = 'doodledash-tab:'
  const tabId = window.name.startsWith(prefix) ? window.name.slice(prefix.length) : crypto.randomUUID()
  if (!window.name.startsWith(prefix)) window.name = `${prefix}${tabId}`
  const storageKey = `doodledash-player-id:${tabId}`
  const saved = sessionStorage.getItem(storageKey)
  if (saved) return saved
  const id = crypto.randomUUID()
  sessionStorage.setItem(storageKey, id)
  return id
}
