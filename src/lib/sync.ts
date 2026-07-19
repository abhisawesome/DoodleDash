import * as Y from 'yjs'
import { io, type Socket } from 'socket.io-client'

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

export class RoomSync {
  readonly doc = new Y.Doc()
  readonly state = this.doc.getMap('game')
  readonly socket: Socket
  synced = false
  private remote = false
  private syncTimer?: number

  private requestSync = () => {
    if (!this.socket.connected || this.synced) return
    this.socket.emit('sync-request', bytesToBase64(Y.encodeStateVector(this.doc)))
  }

  constructor(roomCode: string, identity: { id: string; name: string; avatar: number }) {
    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin
    this.socket = io(url, { path: '/api/socket.io', transports: ['websocket'], auth: { roomCode, ...identity } })
    this.doc.on('update', (update: Uint8Array) => {
      if (!this.remote) this.socket.emit('y-update', bytesToBase64(update))
    })
    this.socket.on('y-update', (payload: string) => {
      this.remote = true
      Y.applyUpdate(this.doc, base64ToBytes(payload), 'remote')
      this.remote = false
    })
    this.socket.on('sync-complete', () => {
      this.synced = true
      if (this.syncTimer) window.clearInterval(this.syncTimer)
      this.socket.emit('client-ready')
    })
    this.socket.on('connect', () => {
      this.synced = false
      this.requestSync()
      if (this.syncTimer) window.clearInterval(this.syncTimer)
      this.syncTimer = window.setInterval(this.requestSync, 750)
    })
    this.socket.on('disconnect', () => {
      this.synced = false
      if (this.syncTimer) window.clearInterval(this.syncTimer)
    })
  }

  destroy() { if (this.syncTimer) window.clearInterval(this.syncTimer); this.socket.disconnect(); this.doc.destroy() }
}
