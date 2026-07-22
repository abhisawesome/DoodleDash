import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { Redis as Upstash } from '@upstash/redis'
import * as Y from 'yjs'
import { guessScore } from './scoring'

const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const base64ToBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64'))
const docs = new Map<string, Y.Doc>()
const instanceId = crypto.randomUUID()
const roomPattern = /^[A-HJ-NP-Z2-9]{6}$/
const blockedWords = /\b(fuck|shit|bitch|cunt)\b/gi
const normalizeGuess = (value: string) => value.trim().toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
type GuessPlayer = { id: string; name: string; score: number; guessed: boolean; spectator: boolean }
type GuessState = { phase?: unknown; word?: unknown; artistId?: unknown; players?: unknown; turnEndsAt?: unknown; round?: unknown; artistIndex?: unknown }
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

// Socket.IO's Redis adapter forwards room events to clients on every instance,
// but it does not run the receiving instance's `socket.on('y-update')` handler.
// Keep each instance's authoritative Y.Doc in sync as well, otherwise a guess
// routed to a different instance can be validated against an old game phase.
io.on('y-doc-update', async (room: unknown, payload: unknown, source: unknown) => {
  if (source === instanceId || typeof room !== 'string' || !roomPattern.test(room) || typeof payload !== 'string' || payload.length > 1_000_000) return
  try {
    const doc = await documentFor(room)
    Y.applyUpdate(doc, base64ToBytes(payload), 'server-sync')
  } catch (error) {
    console.warn(`Could not synchronize room ${room} between realtime instances`, error)
  }
})

let redisAdapterEnabled = false
const syncOtherInstances = (room: string, payload: string) => {
  if (redisAdapterEnabled) io.serverSideEmit('y-doc-update', room, payload, instanceId)
}

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
      redisAdapterEnabled = true
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
  socket.data.takeover = socket.handshake.auth.takeover === true
  next()
})

io.on('connection', async (socket) => {
  const room = socket.data.roomCode as string
  const playerId = socket.data.playerId as string
  const docPromise = documentFor(room)
  if (socket.data.takeover) {
    const existing = await io.in(room).fetchSockets()
    existing.filter((peer) => peer.data.playerId === playerId && peer.id !== socket.id).forEach((peer) => peer.disconnect(true))
  }
  await socket.join(room)
  socket.to(room).emit('peer-joined', playerId)

  const broadcastPresence = async () => {
    const sockets = await io.in(room).fetchSockets()
    const online = Array.from(new Set(sockets.map((peer) => String(peer.data.playerId || '')).filter(Boolean)))
    io.to(room).emit('presence', online)
  }

  socket.on('sync-request', async (stateVector: unknown) => {
    if (typeof stateVector !== 'string' || stateVector.length > 1_000_000) return
    try {
      const doc = await docPromise
      socket.emit('y-update', bytesToBase64(Y.encodeStateAsUpdate(doc, base64ToBytes(stateVector))))
      socket.emit('sync-complete')
    } catch { socket.disconnect(true) }
  })
  socket.on('client-ready', async () => {
    await broadcastPresence()
  })

  socket.on('y-update', async (payload: unknown) => {
    if (typeof payload !== 'string' || payload.length > 1_000_000) return
    try {
      const doc = await docPromise
      const update = base64ToBytes(payload)
      Y.applyUpdate(doc, update, socket.id)
      socket.to(room).emit('y-update', payload)
      syncOtherInstances(room, payload)
      await persist(room, doc)
    } catch { socket.disconnect(true) }
  })
  socket.on('submit-guess', async (payload: unknown, acknowledge?: (result: { accepted: boolean; correct: boolean; reason?: string }) => void) => {
    const guess = typeof payload === 'string' ? payload : payload && typeof payload === 'object' && 'guess' in payload ? (payload as { guess?: unknown }).guess : undefined
    const clientState = payload && typeof payload === 'object' && 'state' in payload ? (payload as { state?: unknown }).state : undefined
    const clientSnapshot = payload && typeof payload === 'object' && 'snapshot' in payload ? (payload as { snapshot?: unknown }).snapshot : undefined
    if (typeof guess !== 'string' || guess.length > 120 || (clientState !== undefined && (typeof clientState !== 'string' || clientState.length > 1_000_000)) || (clientSnapshot !== undefined && (!clientSnapshot || typeof clientSnapshot !== 'object'))) return acknowledge?.({ accepted: false, correct: false, reason: 'Invalid guess' })
    try {
      const doc = await docPromise
      const before = Y.encodeStateVector(doc)
      let submitted = clientSnapshot as GuessState | null
      if (typeof clientState === 'string') {
        const update = base64ToBytes(clientState)
        const submittedDoc = new Y.Doc()
        Y.applyUpdate(submittedDoc, update)
        submitted = submittedDoc.getMap('game').toJSON() as GuessState
        submittedDoc.destroy()
        Y.applyUpdate(doc, update, socket.id)
      }
      const state = doc.getMap('game')
      let phase = state.get('phase')
      let word = state.get('word')
      let players = (state.get('players') || []) as GuessPlayer[]
      let player = players.find((item) => item.id === playerId)

      // A receiving instance can occasionally retain an older top-level Y.Map
      // value after concurrent whole-array updates. Reconcile only to a live,
      // newer drawing turn (or the same drawing turn when this instance is
      // missing the player); never resurrect a completed turn.
      const submittedPlayers = Array.isArray(submitted?.players) ? submitted.players as GuessPlayer[] : []
      const submittedPlayer = submittedPlayers.find((item) => item.id === playerId)
      const submittedRound = typeof submitted?.round === 'number' ? submitted.round : 0
      const submittedArtistIndex = typeof submitted?.artistIndex === 'number' ? submitted.artistIndex : -1
      const serverRound = typeof state.get('round') === 'number' ? state.get('round') as number : 0
      const serverArtistIndex = typeof state.get('artistIndex') === 'number' ? state.get('artistIndex') as number : -1
      const submittedTurn = submittedRound * 100 + submittedArtistIndex
      const serverTurn = serverRound * 100 + serverArtistIndex
      const sameLiveTurn = phase === 'drawing' && submitted?.phase === 'drawing' && submittedTurn === serverTurn && submitted?.artistId === state.get('artistId') && submitted?.word === word && !player
      const newerTurn = submittedTurn > serverTurn || (submittedTurn === serverTurn && phase === 'choosing')
      const canReconcile = submitted?.phase === 'drawing' && typeof submitted.word === 'string' && typeof submitted.artistId === 'string' && typeof submitted.turnEndsAt === 'number' && submitted.turnEndsAt > Date.now() && submittedPlayer && submittedPlayer.id !== submitted.artistId && !submittedPlayer.guessed && !submittedPlayer.spectator && (sameLiveTurn || newerTurn)
      if (canReconcile) {
        doc.transact(() => {
          state.set('phase', submitted!.phase)
          state.set('word', submitted!.word)
          state.set('artistId', submitted!.artistId)
          state.set('players', submittedPlayers)
          state.set('turnEndsAt', submitted!.turnEndsAt)
          state.set('round', submittedRound)
          state.set('artistIndex', submittedArtistIndex)
        }, socket.id)
        phase = state.get('phase')
        word = state.get('word')
        players = (state.get('players') || []) as GuessPlayer[]
        player = players.find((item) => item.id === playerId)
      }
      if (phase !== 'drawing' || typeof word !== 'string' || !player || player.id === state.get('artistId') || player.guessed || player.spectator) return acknowledge?.({ accepted: false, correct: false, reason: 'Guessing is not available' })
      const value = guess.trim().replace(blockedWords, '••••')
      if (!value) return acknowledge?.({ accepted: false, correct: false, reason: 'Enter a guess' })
      const correct = normalizeGuess(value) === normalizeGuess(word)
      doc.transact(() => {
        if (correct) {
          const firstCorrectGuess = !players.some((item) => item.id !== state.get('artistId') && item.guessed)
          const turnEndsAt = state.get('turnEndsAt')
          const settings = state.get('settings') as { turnSeconds?: unknown } | undefined
          const turnSeconds = typeof settings?.turnSeconds === 'number' ? settings.turnSeconds : 80
          const points = guessScore(firstCorrectGuess, typeof turnEndsAt === 'number' ? turnEndsAt : undefined, turnSeconds)
          state.set('players', players.map((item) => item.id === playerId ? { ...item, guessed: true, score: item.score + points } : item))
        }
        const chat = (state.get('chat') || []) as Array<Record<string, unknown>>
        state.set('chat', [...chat.slice(-59), { id: crypto.randomUUID(), at: Date.now(), kind: correct ? 'correct' : 'chat', playerId, playerName: player.name, text: correct ? 'guessed the word!' : value }])
      }, socket.id)
      const update = bytesToBase64(Y.encodeStateAsUpdate(doc, before))
      io.to(room).emit('y-update', update)
      syncOtherInstances(room, update)
      await persist(room, doc)
      acknowledge?.({ accepted: true, correct })
    } catch {
      acknowledge?.({ accepted: false, correct: false, reason: 'Could not submit guess' })
    }
  })
  socket.on('disconnect', async () => {
    const sockets = await io.in(room).fetchSockets()
    if (!sockets.some((peer) => peer.data.playerId === playerId)) socket.to(room).emit('peer-left', playerId)
    await broadcastPresence()
  })
})

export default httpServer
