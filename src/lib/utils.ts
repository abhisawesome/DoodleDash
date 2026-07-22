import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function makeRoomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export type RoomIdentity = { id: string; name: string; avatar: number; tabId: string; expiresAt: number }

export function browserTabId() {
  const prefix = 'doodledash-tab:'
  const tabId = window.name.startsWith(prefix) ? window.name.slice(prefix.length) : crypto.randomUUID()
  if (!window.name.startsWith(prefix)) window.name = `${prefix}${tabId}`
  return tabId
}

const identityKey = (roomCode: string) => `doodledash-room-identity:${roomCode.toUpperCase()}`

export function savedRoomIdentity(roomCode: string) {
  try {
    const identity = JSON.parse(localStorage.getItem(identityKey(roomCode)) || 'null') as RoomIdentity | null
    if (!identity?.id || !identity.name || identity.expiresAt <= Date.now()) {
      localStorage.removeItem(identityKey(roomCode))
      return null
    }
    return identity
  } catch { return null }
}

export function saveRoomIdentity(roomCode: string, identity: Omit<RoomIdentity, 'tabId' | 'expiresAt'>) {
  const saved = { ...identity, tabId: browserTabId(), expiresAt: Date.now() + 15 * 60_000 }
  try { localStorage.setItem(identityKey(roomCode), JSON.stringify(saved)) } catch { /* Fall back to this page's in-memory identity. */ }
  return saved
}

export function refreshRoomIdentity(roomCode: string, identity: RoomIdentity) {
  return saveRoomIdentity(roomCode, identity)
}

export function clearRoomIdentity(roomCode: string) {
  try { localStorage.removeItem(identityKey(roomCode)) } catch { /* Storage may be unavailable. */ }
}
