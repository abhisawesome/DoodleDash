import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Crown, Eye, Link2, LoaderCircle, Palette, Play, Users, Volume2, VolumeX, X } from 'lucide-react'
import type { GameState, Player, Stroke, ChatMessage } from '@/lib/game'
import { DEFAULT_SETTINGS, MAX_PLAYERS, chooseWords, fixedArtistScore, fixedGuessScore, isCorrectGuess, maskWord } from '@/lib/game'
import { makeRoomCode, playerId } from '@/lib/utils'
import { RoomSync } from '@/lib/sync'
import { DrawingCanvas } from '@/components/DrawingCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const AVATARS = ['🦊','🐼','🐸','🐙','🦁','🐨','🐯','🦄']
const cleanName = (value: string) => value.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 18)
const blockedWords = /\b(fuck|shit|bitch|cunt)\b/gi

function Home() {
  const navigate = useNavigate(); const sharedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() || ''; const [name, setName] = useState(localStorage.getItem('doodledash-name') || ''); const [code, setCode] = useState(sharedRoom)
  const go = (roomCode: string) => { const safe = cleanName(name); if (!safe) return; localStorage.setItem('doodledash-name', safe); navigate(`/room/${roomCode.toUpperCase()}?name=${encodeURIComponent(safe)}`) }
  return <main className="flex min-h-screen items-center justify-center p-5"><section className="w-full max-w-lg text-center">
    <div className="mb-8"><div className="mx-auto mb-4 grid size-20 rotate-3 place-items-center rounded-3xl bg-amber-300 text-4xl shadow-pop"><Palette /></div><h1 className="brand text-5xl font-black tracking-tight text-violet-700 sm:text-6xl">DoodleDash</h1><p className="mt-3 text-lg font-medium text-violet-950/70">Draw it. Guess it. Laugh about it.</p></div>
    <div className="space-y-4 rounded-3xl border-4 border-white bg-white/90 p-6 text-left shadow-pop"><label className="font-bold" htmlFor="name">Your nickname</label><Input id="name" autoFocus maxLength={18} placeholder="PicassoPanda" value={name} onChange={(e) => setName(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!cleanName(name)} onClick={() => go(makeRoomCode())}><Play /> Create a room</Button>
      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-400"><span className="h-px flex-1 bg-slate-200" />{sharedRoom ? `Join room ${sharedRoom}` : 'or join friends'}<span className="h-px flex-1 bg-slate-200" /></div>
      <div className="flex gap-2"><Input aria-label="Room code" maxLength={6} className="uppercase" placeholder="K7MX2Q" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && go(code)} /><Button variant="secondary" disabled={code.length !== 6 || !cleanName(name)} onClick={() => go(code)}><Users /> Join</Button></div>
    </div><p className="mt-5 text-sm text-violet-900/60">No account needed · Up to 20 players · Works on mobile</p>
  </section></main>
}

function useYState(sync: RoomSync) {
  const [snapshot, setSnapshot] = useState<GameState>(() => sync.state.toJSON() as GameState)
  useEffect(() => {
    const update = () => setSnapshot(sync.state.toJSON() as GameState)
    sync.state.observeDeep(update)
    update()
    return () => sync.state.unobserveDeep(update)
  }, [sync])
  return snapshot
}

function Room() {
  const { code = '' } = useParams(); const params = new URLSearchParams(location.search); const name = cleanName(params.get('name') || localStorage.getItem('doodledash-name') || '')
  const me = useMemo(() => playerId(), []); const avatar = useMemo(() => Math.floor(Math.random() * AVATARS.length), [])
  const sync = useMemo(() => new RoomSync(code, { id: me, name, avatar }), [code, me, name, avatar]); const state = useYState(sync)
  const leaveTimers = useRef(new Map<string, number>())
  const lastPhase = useRef(state.phase)
  const [guess, setGuess] = useState(''); const [connected, setConnected] = useState(sync.socket.connected); const [synced, setSynced] = useState(sync.synced); const [muted, setMuted] = useState(false); const [copied, setCopied] = useState(false); const [now, setNow] = useState(Date.now())
  const set = (patch: Partial<GameState>) => sync.doc.transact(() => Object.entries(patch).forEach(([key, value]) => sync.state.set(key, value)))

  useEffect(() => {
    const presence = (onlineIds: string[]) => {
      const online = new Set(onlineIds)
      const latest = sync.state.toJSON() as GameState
      if (!latest.players?.length) return
      const players = latest.players.map((player) => ({ ...player, connected: online.has(player.id) }))
      const hostOnline = online.has(latest.hostId)
      const nextHost = hostOnline ? latest.hostId : players.find((player) => player.connected)?.id || latest.hostId
      set({ players, hostId: nextHost })
    }
    sync.socket.on('presence', presence)
    return () => { sync.socket.off('presence', presence) }
  }, [sync])

  useEffect(() => { const on = () => setConnected(true), off = () => { setConnected(false); setSynced(false) }, ready = () => setSynced(true); sync.socket.on('connect', on); sync.socket.on('disconnect', off); sync.socket.on('sync-complete', ready); if (sync.socket.connected) on(); if (sync.synced) ready(); return () => { sync.socket.off('connect', on); sync.socket.off('disconnect', off); sync.socket.off('sync-complete', ready); sync.destroy() } }, [sync])
  useEffect(() => {
    const joined = (id: string) => {
      const timer = leaveTimers.current.get(id); if (timer) clearTimeout(timer)
      const latest = sync.state.toJSON() as GameState
      if (latest.players?.some((p) => p.id === id && !p.connected)) set({ players: latest.players.map((p) => p.id === id ? { ...p, connected: true } : p) })
    }
    const left = (id: string) => {
      const latest = sync.state.toJSON() as GameState
      if (latest.players) set({ players: latest.players.map((p) => p.id === id ? { ...p, connected: false } : p) })
      leaveTimers.current.set(id, window.setTimeout(() => {
        const next = sync.state.toJSON() as GameState; const leaver = next.players?.find((p) => p.id === id)
        if (!leaver || leaver.connected) return
        const remaining = next.players.filter((p) => p.id !== id)
        set({ players: remaining, hostId: next.hostId === id ? remaining[0]?.id || '' : next.hostId, ...(next.artistId === id ? { turnEndsAt: Date.now() } : {}) })
      }, 15_000))
    }
    sync.socket.on('peer-joined', joined); sync.socket.on('peer-left', left)
    return () => { sync.socket.off('peer-joined', joined); sync.socket.off('peer-left', left); leaveTimers.current.forEach(clearTimeout) }
  }, [sync])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (muted || !state.phase || state.phase === lastPhase.current) return
    lastPhase.current = state.phase
    try {
      const Audio = window.AudioContext || window.webkitAudioContext
      const audio = new Audio(); const oscillator = audio.createOscillator(); const gain = audio.createGain()
      oscillator.frequency.value = state.phase === 'game-results' ? 660 : state.phase === 'drawing' ? 520 : 390
      gain.gain.setValueAtTime(.06, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .14)
      oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .15)
    } catch { /* Audio may be blocked until the first interaction. */ }
  }, [muted, state.phase])
  useEffect(() => {
    if (!connected || !synced) return
    const players = state.players || []
    if (!state.roomCode) {
      const first: Player = { id: me, name, avatar, score: 0, connected: true, guessed: false, spectator: false }
      set({ roomCode: code, hostId: me, phase: 'lobby', players: [first], settings: DEFAULT_SETTINGS, round: 1, artistIndex: -1, choices: [], maskedWord: '', strokes: [], chat: [] })
      queueMicrotask(() => sync.socket.emit('client-ready'))
    } else if (!players.some((p) => p.id === me) && players.length < MAX_PLAYERS) {
      const duplicate = players.some((p) => p.name.toLowerCase() === name.toLowerCase())
      const finalName = duplicate ? `${name.slice(0, 14)}-${String(Math.floor(Math.random() * 90 + 10))}` : name
      set({ players: [...players, { id: me, name: finalName, avatar, score: 0, connected: true, guessed: false, spectator: state.phase !== 'lobby' }] })
      queueMicrotask(() => sync.socket.emit('client-ready'))
    }
  }, [connected, synced, state.roomCode])

  const players = state.players || []; const settings = state.settings || DEFAULT_SETTINGS; const current = players.find((p) => p.id === me); const isHost = state.hostId === me; const isArtist = state.artistId === me
  const seconds = state.turnEndsAt ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000)) : settings.turnSeconds
  const addMessage = (message: Omit<ChatMessage, 'id' | 'at'>) => set({ chat: [...(state.chat || []).slice(-59), { ...message, id: crypto.randomUUID(), at: Date.now() }] })
  const startTurn = () => {
    const latest = sync.state.toJSON() as GameState
    const latestSettings = latest.settings || DEFAULT_SETTINGS
    const active = (latest.players || []).filter((p) => !p.spectator && p.connected)
    if (!active.length) return
    const completedRound = latest.artistIndex >= active.length - 1
    if (latest.artistIndex >= 0 && completedRound && latest.round >= latestSettings.rounds) return set({ phase: 'game-results' })
    const next = completedRound ? 0 : latest.artistIndex + 1
    const round = completedRound && latest.artistIndex >= 0 ? latest.round + 1 : latest.round
    set({ phase: 'choosing', artistIndex: next, round, artistId: active[next].id, choices: chooseWords(latestSettings), word: '', maskedWord: '', strokes: [], players: (latest.players || []).map((p) => ({ ...p, guessed: false, spectator: false })) })
  }
  const choose = (word: string) => set({ word, maskedWord: maskWord(word), choices: [], phase: 'drawing', turnEndsAt: Date.now() + settings.turnSeconds * 1000 })
  const endTurn = (playersOverride?: Player[]) => {
    const latest = sync.state.toJSON() as GameState
    if (latest.phase !== 'drawing') return
    const turnPlayers = playersOverride || latest.players || []
    const correct = turnPlayers.filter((p) => p.guessed).length
    const scored = turnPlayers.map((p) => p.id === latest.artistId ? { ...p, score: p.score + fixedArtistScore(correct) } : p)
    set({ phase: 'turn-results', turnEndsAt: undefined, players: scored })
    window.setTimeout(startTurn, 3500)
  }
  useEffect(() => { if (isHost && state.phase === 'drawing' && seconds === 0) endTurn() }, [seconds, isHost, state.phase])
  useEffect(() => {
    if (!isHost || !settings.hints || state.phase !== 'drawing' || !state.word) return
    const elapsed = settings.turnSeconds - seconds
    const revealCount = elapsed >= settings.turnSeconds * .72 ? 2 : elapsed >= settings.turnSeconds * .42 ? 1 : 0
    const letterIndexes = [...state.word].map((letter, index) => letter === ' ' ? -1 : index).filter((index) => index >= 0)
    const revealed = letterIndexes.filter((_, index) => index < revealCount)
    const nextMask = maskWord(state.word, revealed)
    if (nextMask !== state.maskedWord) set({ maskedWord: nextMask })
  }, [seconds, isHost, state.phase, state.word, settings.hints])
  if (!name) return <Navigate to="/" replace />
  if (!state.roomCode) return <main className="grid min-h-screen place-items-center"><div className="rounded-2xl bg-white p-6 font-bold shadow-pop">Connecting to room {code}…</div></main>
  const submitGuess = () => {
    const value = guess.trim().replace(blockedWords, '••••'); setGuess(''); if (!value || isArtist || current?.guessed) return
    if (state.word && isCorrectGuess(value, state.word)) {
      const updated = players.map((p) => p.id === me ? { ...p, guessed: true, score: p.score + fixedGuessScore() } : p)
      set({ players: updated, chat: [...(state.chat || []).slice(-59), { id: crypto.randomUUID(), at: Date.now(), kind: 'correct', playerId: me, playerName: current?.name, text: 'guessed the word!' }] })
      const guessers = updated.filter((p) => p.id !== state.artistId && !p.spectator && p.connected)
      if (guessers.length > 0 && guessers.every((p) => p.guessed)) queueMicrotask(() => endTurn(updated))
    }
    else addMessage({ kind: 'chat', playerId: me, playerName: current?.name, text: value.slice(0, 120) })
  }
  const copy = async () => {
    const appUrl = (import.meta.env.VITE_APP_URL || location.origin).replace(/\/$/, '')
    const shareUrl = `${appUrl}/?room=${code}`
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const input = document.createElement('textarea')
      input.value = shareUrl; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const artistName = players.find((player) => player.id === state.artistId)?.name || 'The artist'
  const choosingModal = <Dialog.Root open={state.phase === 'choosing'}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-violet-950/55 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border-4 border-white bg-white p-6 text-center shadow-2xl focus:outline-none">
        {isArtist ? <>
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-amber-300 text-2xl">✏️</div>
          <Dialog.Title className="text-2xl font-black text-violet-800">Choose your word</Dialog.Title>
          <Dialog.Description className="mb-5 mt-1 text-slate-600">Pick one word to draw. Only you can see these choices.</Dialog.Description>
          <div className="grid gap-3 sm:grid-cols-3">{state.choices.map((word) => <Button key={word} size="lg" variant="secondary" className="whitespace-normal" onClick={() => choose(word)}>{word}</Button>)}</div>
        </> : <>
          <LoaderCircle className="mx-auto mb-4 size-12 animate-spin text-violet-600" aria-hidden="true" />
          <Dialog.Title className="text-2xl font-black text-violet-800">{artistName} is choosing</Dialog.Title>
          <Dialog.Description className="mt-2 text-slate-600">The next word is being selected. Get ready to guess!</Dialog.Description>
        </>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>

  return <main className="min-h-screen p-3 md:p-5"><header className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-3"><a href="/" className="brand text-2xl font-black text-violet-700 sm:text-3xl">DoodleDash</a><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{connected ? '● Live' : 'Reconnecting…'}</span><Button size="sm" variant="outline" aria-label="Copy room invite link" onClick={copy}><Copy className="size-4" /> {copied ? 'Copied!' : code}</Button><Button size="icon" variant="ghost" aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX /> : <Volume2 />}</Button></div></header>
    {choosingModal}
    <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[200px_minmax(0,1fr)_280px]">
      <aside className="order-2 rounded-3xl bg-white/90 p-4 shadow-pop lg:order-1"><h2 className="mb-3 flex items-center gap-2 font-black"><Users className="size-5" /> Players <span className="ml-auto text-sm text-slate-400">{players.length}/{MAX_PLAYERS}</span></h2><ol className="space-y-2">{[...players].sort((a,b) => b.score-a.score).map((p, i) => <li key={p.id} className={`flex items-center gap-2 rounded-xl p-2 ${p.id === state.artistId ? 'bg-amber-100' : 'bg-violet-50'}`}><span className="grid size-9 place-items-center rounded-full bg-white text-xl">{AVATARS[p.avatar % AVATARS.length]}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{p.name} {p.id === state.hostId && <Crown className="inline size-3 text-amber-500" />}</span><span className="text-xs font-bold text-violet-600">{p.score} pts</span></span>{p.spectator && <Eye className="size-4 text-slate-400" />}{p.guessed && <span title="Guessed">✓</span>}{isHost && p.id !== me && state.phase === 'lobby' && <button aria-label={`Kick ${p.name}`} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600" onClick={() => set({ players: players.filter((item) => item.id !== p.id) })}><X className="size-4" /></button>}<span className="sr-only">Rank {i + 1}</span></li>)}</ol></aside>
      <section className="order-1 min-w-0 lg:order-2"><div className="mb-3 flex items-center justify-between rounded-2xl bg-violet-700 px-5 py-3 text-white shadow-pop"><span className="font-bold">Round {state.round}/{state.settings.rounds}</span><span className="text-xl font-black tracking-[.2em]">{isArtist && state.word ? state.word.toUpperCase() : state.maskedWord || 'WAITING'}</span><span className={`grid size-11 place-items-center rounded-full font-black ${seconds <= 10 ? 'bg-rose-500' : 'bg-white/20'}`}>{seconds}</span></div>
        <DrawingCanvas strokes={state.strokes || []} canDraw={isArtist && state.phase === 'drawing'} onStroke={(stroke: Stroke) => set({ strokes: [...(state.strokes || []), stroke] })} onUndo={() => set({ strokes: (state.strokes || []).slice(0,-1) })} onClear={() => set({ strokes: [] })} />
        {state.phase === 'lobby' && <div className="mt-4 rounded-2xl bg-white p-5 text-center shadow-pop"><h2 className="text-xl font-black">Your drawing crew is assembling!</h2><p className="my-2 text-slate-600"><Link2 className="inline size-4" /> Share room code <b>{code}</b>. At least 2 players are needed.</p>{isHost ? <><div className="mx-auto mb-4 grid max-w-xl gap-3 text-left sm:grid-cols-2"><label className="text-sm font-bold">Rounds<select className="mt-1 h-11 w-full rounded-xl border-2 border-violet-200 px-3" value={settings.rounds} onChange={(e) => set({ settings: { ...settings, rounds: Number(e.target.value) } })}>{[2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label><label className="text-sm font-bold">Turn time<select className="mt-1 h-11 w-full rounded-xl border-2 border-violet-200 px-3" value={settings.turnSeconds} onChange={(e) => set({ settings: { ...settings, turnSeconds: Number(e.target.value) } })}>{[30,60,80,90,120].map((n) => <option key={n} value={n}>{n} seconds</option>)}</select></label><label className="text-sm font-bold sm:col-span-2">Custom words<textarea className="mt-1 min-h-20 w-full rounded-xl border-2 border-violet-200 p-3 font-medium outline-none focus:border-violet-500" placeholder="spaceship, mango, cricket bat" value={settings.customWords.join(', ')} onChange={(e) => set({ settings: { ...settings, customWords: e.target.value.split(',').map((word) => word.trim()).filter(Boolean).slice(0,100) } })} /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.customOnly} onChange={(e) => set({ settings: { ...settings, customOnly: e.target.checked } })} /> Custom words only</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.hints} onChange={(e) => set({ settings: { ...settings, hints: e.target.checked } })} /> Automatic hints</label></div><Button disabled={players.length < 2 || (settings.customOnly && settings.customWords.length < 3)} onClick={startTurn}><Play /> Start game</Button></> : <p className="font-bold text-violet-600">Waiting for the host…</p>}</div>}
        {state.phase === 'turn-results' && <div className="mt-4 rounded-2xl bg-amber-200 p-5 text-center shadow-pop"><p>The word was</p><h2 className="text-3xl font-black">{state.word}</h2></div>}
        {state.phase === 'game-results' && <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow-pop"><h2 className="text-3xl font-black">🏆 {([...players].sort((a,b) => b.score-a.score)[0]?.name)} wins!</h2>{isHost && <Button className="mt-4" onClick={() => set({ phase: 'lobby', round: 1, artistIndex: -1, players: players.map((p) => ({ ...p, score: 0, guessed: false })) })}>Play again</Button>}</div>}
      </section>
      <aside className="order-3 flex min-h-[320px] flex-col rounded-3xl bg-white/90 p-4 shadow-pop"><h2 className="mb-3 font-black">Guesses & chat</h2><div role="log" aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto">{(state.chat || []).map((m) => <p key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.kind === 'correct' ? 'bg-emerald-100 font-bold text-emerald-800' : m.kind === 'system' ? 'bg-amber-100' : 'bg-slate-50'}`}>{m.playerName && <b>{m.playerName}: </b>}{m.text}</p>)}</div><div className="mt-3 flex gap-2"><Input aria-label="Your guess" placeholder={current?.guessed ? 'You got it!' : isArtist ? 'You are drawing' : 'Type a guess…'} disabled={isArtist || current?.guessed || state.phase !== 'drawing'} value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitGuess()} /><Button size="sm" onClick={submitGuess}>Send</Button></div></aside>
    </div>
  </main>
}

export default function App() { return <BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/room/:code" element={<Room />} /><Route path="*" element={<Navigate to="/" />} /></Routes></BrowserRouter> }
