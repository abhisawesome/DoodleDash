import { useEffect, useRef, useState } from 'react'
import { Eraser, Maximize2, Minimize2, RotateCcw, Trash2 } from 'lucide-react'
import type { Stroke, StrokePoint } from '@/lib/game'
import { Button } from '@/components/ui/button'

const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']

type Props = { strokes: Stroke[]; canDraw: boolean; onStroke: (stroke: Stroke) => void; onUndo: () => void; onClear: () => void }

export function DrawingCanvas({ strokes, canDraw, onStroke, onUndo, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const active = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(6)
  const [eraser, setEraser] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!canDraw) { setExpanded(false); return }
    if (window.matchMedia('(max-width: 767px)').matches) setExpanded(true)
  }, [canDraw])

  useEffect(() => {
    if (!expanded) return
    const scrollY = window.scrollY
    const root = document.documentElement
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousWidth = document.body.style.width
    const previousRootOverflow = root.style.overflow
    const previousRootOverscroll = root.style.overscrollBehavior
    root.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      root.style.overflow = previousRootOverflow
      root.style.overscrollBehavior = previousRootOverscroll
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.width = previousWidth
      window.scrollTo(0, scrollY)
    }
  }, [expanded])

  const paint = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== canvas.clientWidth * ratio || canvas.height !== canvas.clientHeight * ratio) {
      canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    for (const stroke of strokes) {
      if (stroke.points.length < 1) continue
      ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke.erased ? '#fff' : stroke.color; ctx.lineWidth = stroke.width
      const [first, ...rest] = stroke.points; ctx.moveTo(first.x * canvas.clientWidth, first.y * canvas.clientHeight)
      rest.forEach((p) => ctx.lineTo(p.x * canvas.clientWidth, p.y * canvas.clientHeight)); ctx.stroke()
    }
  }
  useEffect(paint, [strokes, expanded])
  useEffect(() => { window.addEventListener('resize', paint); return () => window.removeEventListener('resize', paint) })

  const point = (event: React.PointerEvent): StrokePoint => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return
    event.currentTarget.setPointerCapture(event.pointerId)
    active.current = { id: crypto.randomUUID(), color, width: eraser ? Math.max(18, width * 3) : width, erased: eraser, points: [point(event)] }
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return
    active.current.points.push(point(event))
    const preview = [...strokes, active.current]
    const canvas = canvasRef.current; if (!canvas) return
    const saved = active.current; active.current = null
    // Paint the local preview without generating network traffic for every pointer pixel.
    const ctx = canvas.getContext('2d')!; const p = saved.points
    if (p.length > 1) { const a = p[p.length - 2], b = p[p.length - 1]; ctx.beginPath(); ctx.strokeStyle = saved.erased ? '#fff' : saved.color; ctx.lineWidth = saved.width; ctx.lineCap = 'round'; ctx.moveTo(a.x * canvas.clientWidth, a.y * canvas.clientHeight); ctx.lineTo(b.x * canvas.clientWidth, b.y * canvas.clientHeight); ctx.stroke() }
    active.current = saved; void preview
  }
  const end = () => { if (active.current?.points.length) onStroke(active.current); active.current = null }

  return <div className={expanded ? 'fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col gap-2 overflow-hidden overscroll-none bg-violet-100 p-2' : 'space-y-3'}>
    <div className={`canvas-grid relative w-full flex-1 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-pop ${expanded ? 'min-h-0' : 'h-[58dvh] min-h-[380px] md:h-auto md:min-h-0 md:aspect-[4/3]'}`}>
      <canvas ref={canvasRef} aria-label={canDraw ? 'Drawing canvas' : 'Current drawing'} className={`h-full w-full touch-none select-none overscroll-contain ${canDraw ? 'cursor-crosshair' : 'cursor-default'}`} onContextMenu={(event) => event.preventDefault()} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <Button size="icon" variant="outline" className="absolute right-3 top-3 bg-white/95" aria-label={expanded ? 'Exit expanded canvas' : 'Expand canvas'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
      {!canDraw && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-white">Watching</span>}
    </div>
    {canDraw && <div className={`flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 shadow ${expanded ? 'shrink-0' : ''}`}>
      <div className="flex flex-wrap gap-1" aria-label="Brush colors">{COLORS.map((item) => <button key={item} aria-label={`Use ${item}`} className={`size-8 rounded-full border-2 ${color === item && !eraser ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`} style={{ background: item }} onClick={() => { setColor(item); setEraser(false) }} />)}</div>
      <select aria-label="Brush size" className="h-9 rounded-lg border px-2" value={width} onChange={(e) => setWidth(Number(e.target.value))}><option value="3">Thin</option><option value="6">Medium</option><option value="12">Thick</option></select>
      <Button size="icon" variant={eraser ? 'default' : 'outline'} aria-label="Eraser" onClick={() => setEraser(!eraser)}><Eraser className="size-4" /></Button>
      <Button size="icon" variant="outline" aria-label="Undo last stroke" onClick={onUndo}><RotateCcw className="size-4" /></Button>
      <Button size="icon" variant="outline" aria-label="Clear canvas" onClick={onClear}><Trash2 className="size-4" /></Button>
    </div>}
  </div>
}
