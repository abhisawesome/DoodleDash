import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browserTabId, clearRoomIdentity, saveRoomIdentity, savedRoomIdentity } from './utils'

describe('room identity storage', () => {
  beforeEach(() => {
    localStorage.clear()
    window.name = ''
    vi.restoreAllMocks()
  })

  it('keeps an identity scoped to its room and browser tab', () => {
    const identity = saveRoomIdentity('ABC234', { id: 'player-1', name: 'Panda', avatar: 2 })
    expect(savedRoomIdentity('ABC234')).toEqual(identity)
    expect(savedRoomIdentity('XYZ567')).toBeNull()
    expect(identity.tabId).toBe(browserTabId())
  })

  it('removes expired and completed-game identities', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    saveRoomIdentity('ABC234', { id: 'player-1', name: 'Panda', avatar: 2 })
    vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60_000 + 1)
    expect(savedRoomIdentity('ABC234')).toBeNull()

    vi.spyOn(Date, 'now').mockReturnValue(now)
    saveRoomIdentity('ABC234', { id: 'player-1', name: 'Panda', avatar: 2 })
    clearRoomIdentity('ABC234')
    expect(savedRoomIdentity('ABC234')).toBeNull()
  })
})
