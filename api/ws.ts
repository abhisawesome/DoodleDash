import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { Redis as Upstash } from '@upstash/redis'
import * as Y from 'yjs'

const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const base64ToBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64'))
const docs = new Map<string, Y.Doc>()
const roomPattern = /^[A-HJ-NP-Z2-9]{6}$/
const snapshotStore = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Upstash.fromEnv() : null
const redisTimeout = <T,>(operation: Promise<T>, ms = 1500) => Promise.race<T>([
  operation,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Redis request timed out')), ms)),
])

async function documentFor(room: string) {
  const cached = docs.get(room)
  if (cached) return cached
  const doc = new Y.Doc()
  if (snapshotStore) {
    try {
      const saved = await redisTimeout(snapshotStore.get<string>(`doodledash:room:${room}`))
      if (typeof saved === 'string' && saved) Y.applyUpdate(doc, base64ToBytes(saved), 'snapshot')
    } catch (error) {
      console.warn(`Redis snapshot unavailable for room ${room}; using memory`, error)
    }
  }
  docs.set(room, doc)
  return doc
}

async function persist(room: string, doc: Y.Doc) {
  if (!snapshotStore) return
  try {
    await redisTimeout(snapshotStore.set(`doodledash:room:${room}`, bytesToBase64(Y.encodeStateAsUpdate(doc)), { ex: 3600 }))
  } catch (error) {
    console.warn(`Could not persist room ${room}`, error)
  }
}

const httpServer = createServer((_, response) => { response.writeHead(200); response.end('DoodleDash realtime server') })
const io = new Server(httpServer, {
  path: '/api/ws', transports: ['websocket'], serveClient: false,
  cors: { origin: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : true },
  maxHttpBufferSize: 1e6,
})

let nativeRedisUrl: string | undefined
if (process.env.REDIS_URL) {
  try {
    const parsed = new URL(process.env.REDIS_URL)
    if (parsed.protocol !== 'rediss:' || !parsed.password) {
      console.warn('REDIS_URL must use rediss:// and include a password after the username; continuing without Redis pub/sub')
    } else nativeRedisUrl = process.env.REDIS_URL
  } catch {
    console.warn('REDIS_URL is not a valid URL; continuing without Redis pub/sub')
  }
}

if (nativeRedisUrl) {
  const publisher = new Redis(nativeRedisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 3_000,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
  })
  const subscriber = publisher.duplicate()
  publisher.on('error', (error) => console.warn('Redis publisher connection error:', error.message))
  subscriber.on('error', (error) => console.warn('Redis subscriber connection error:', error.message))
  publisher.on('connect', () => console.info('Redis publisher connected'))
  subscriber.on('connect', () => console.info('Redis subscriber connected'))
  void Promise.all([publisher.connect(), subscriber.connect()])
    .then(() => {
      io.adapter(createAdapter(publisher, subscriber))
      console.info('Redis pub/sub adapter enabled')
    })
    .catch((error: Error) => {
      console.warn('Redis pub/sub unavailable; continuing with single-instance realtime:', error.message)
      publisher.disconnect(); subscriber.disconnect()
    })
}

io.use((socket, next) => {
  const roomCode = String(socket.handshake.auth.roomCode || '').toUpperCase()
  const playerId = String(socket.handshake.auth.id || '')
  if (!roomPattern.test(roomCode) || !playerId || playerId.length > 80) return next(new Error('Invalid room'))
  socket.data.roomCode = roomCode
  socket.data.playerId = playerId
  next()
})

io.on('connection', (socket) => {
  const room = socket.data.roomCode as string
  const playerId = socket.data.playerId as string
  const docPromise = documentFor(room)
  void socket.join(room)
  socket.to(room).emit('peer-joined', playerId)

  socket.on('sync-request', async (stateVector: unknown) => {
    if (typeof stateVector !== 'string' || stateVector.length > 1_000_000) return
    try {
      const doc = await docPromise
      socket.emit('y-update', bytesToBase64(Y.encodeStateAsUpdate(doc, base64ToBytes(stateVector))))
      socket.emit('sync-complete')
    } catch { socket.disconnect(true) }
  })
  socket.on('client-ready', async () => {
    const sockets = await io.in(room).fetchSockets()
    const online = Array.from(new Set(sockets.map((peer) => String(peer.data.playerId || '')).filter(Boolean)))
    io.to(room).emit('presence', online)
  })

  socket.on('y-update', async (payload: unknown) => {
    if (typeof payload !== 'string' || payload.length > 1_000_000) return
    try {
      const doc = await docPromise
      const update = base64ToBytes(payload)
      Y.applyUpdate(doc, update, socket.id)
      socket.to(room).emit('y-update', payload)
      await persist(room, doc)
    } catch { socket.disconnect(true) }
  })
  socket.on('disconnect', () => socket.to(room).emit('peer-left', playerId))
})

export default httpServer
