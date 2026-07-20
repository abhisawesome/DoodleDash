import { useEffect, useRef, useState } from 'react'
import { Circle, Eraser, Maximize2, Minimize2, Minus, Pencil, RotateCcw, Square, Trash2 } from 'lucide-react'
import type { Stroke, StrokePoint } from '@/lib/game'
import { Button } from '@/components/ui/button'

const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
type Tool = 'brush' | 'line' | 'rectangle' | 'circle' | 'eraser'

type Props = { strokes: Stroke[]; canDraw: boolean; onStroke: (stroke: Stroke) => void; onUndo: () => void; onClear: () => void }

export function DrawingCanvas({ strokes, canDraw, onStroke, onUndo, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const active = useRef<Stroke | null>(null)
  const startPoint = useRef<StrokePoint | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(6)
  const [tool, setTool] = useState<Tool>('brush')
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

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, canvas: HTMLCanvasElement) => {
    if (!stroke.points.length) return
    const points = stroke.points.map((p) => ({ x: p.x * canvas.clientWidth, y: p.y * canvas.clientHeight }))
    ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke.erased ? '#fff' : stroke.color; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = stroke.width
    if (points.length === 1) { ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill(); return }
    ctx.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length - 1; index++) {
      const midpoint = { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 }
      ctx.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y)
    }
    const last = points[points.length - 1]; ctx.lineTo(last.x, last.y); ctx.stroke()
  }
  const paint = (preview?: Stroke) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== canvas.clientWidth * ratio || canvas.height !== canvas.clientHeight * ratio) {
      canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    strokes.forEach((stroke) => drawStroke(ctx, stroke, canvas))
    if (preview) drawStroke(ctx, preview, canvas)
  }
  useEffect(() => paint(), [strokes, expanded])
  useEffect(() => { const repaint = () => paint(); window.addEventListener('resize', repaint); return () => window.removeEventListener('resize', repaint) })

  const point = (event: { clientX: number; clientY: number }): StrokePoint => {
    const box = canvasRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }
  }
  const shapePoints = (from: StrokePoint, to: StrokePoint) => {
    if (tool === 'line') return [from, to]
    if (tool === 'rectangle') return [from, { x: to.x, y: from.y }, to, { x: from.x, y: to.y }, from]
    if (tool === 'circle') return Array.from({ length: 41 }, (_, index) => { const angle = index / 40 * Math.PI * 2; return { x: (from.x + to.x) / 2 + Math.cos(angle) * Math.abs(to.x - from.x) / 2, y: (from.y + to.y) / 2 + Math.sin(angle) * Math.abs(to.y - from.y) / 2 } })
    return [from, to]
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const first = point(event); startPoint.current = first
    active.current = { id: crypto.randomUUID(), color, width: tool === 'eraser' ? Math.max(18, width * 3) : width, erased: tool === 'eraser', points: [first] }
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return
    const points = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent]
    if (tool === 'brush' || tool === 'eraser') active.current.points.push(...points.map(point))
    else if (startPoint.current) active.current.points = shapePoints(startPoint.current, point(event))
    paint(active.current)
  }
  const end = () => { if (active.current?.points.length) onStroke(active.current); active.current = null; startPoint.current = null }

  return <div className={expanded ? 'fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col gap-2 overflow-hidden overscroll-none bg-violet-100 p-2' : 'space-y-3'}>
    <div className={`canvas-grid relative w-full flex-1 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-pop ${expanded ? 'min-h-0' : 'h-[58dvh] min-h-[380px] md:h-auto md:min-h-0 md:aspect-[4/3]'}`}>
      <canvas ref={canvasRef} aria-label={canDraw ? 'Drawing canvas' : 'Current drawing'} className={`h-full w-full touch-none select-none overscroll-contain ${canDraw ? 'cursor-crosshair' : 'cursor-default'}`} onContextMenu={(event) => event.preventDefault()} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <Button size="icon" variant="outline" className="absolute right-3 top-3 bg-white/95" aria-label={expanded ? 'Exit expanded canvas' : 'Expand canvas'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
      {!canDraw && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-white">Watching</span>}
    </div>
    {canDraw && <div className={`flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white p-2 shadow ${expanded ? 'shrink-0' : ''}`}>
      <div className="flex gap-1 rounded-xl bg-violet-50 p-1" aria-label="Drawing tools">
        {([['brush', Pencil, 'Freehand brush'], ['line', Minus, 'Straight line'], ['rectangle', Square, 'Rectangle'], ['circle', Circle, 'Circle'], ['eraser', Eraser, 'Eraser']] as const).map(([value, Icon, label]) => <Button key={value} size="icon" variant={tool === value ? 'default' : 'ghost'} aria-label={label} title={label} onClick={() => setTool(value)}><Icon className="size-5" /></Button>)}
      </div>
      <div className="flex flex-wrap justify-center gap-1" aria-label="Brush colors">{COLORS.map((item) => <button key={item} aria-label={`Use ${item}`} className={`size-9 rounded-full border-2 ${color === item && tool !== 'eraser' ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`} style={{ background: item }} onClick={() => { setColor(item); setTool('brush') }} />)}</div>
      <select aria-label="Brush size" className="h-10 rounded-lg border px-3 font-bold" value={width} onChange={(e) => setWidth(Number(e.target.value))}><option value="3">Thin</option><option value="6">Medium</option><option value="12">Thick</option><option value="20">Extra thick</option></select>
      <Button size="icon" variant="outline" aria-label="Undo last stroke" title="Undo" disabled={!strokes.length} onClick={onUndo}><RotateCcw className="size-5" /></Button>
      <Button size="icon" variant="outline" aria-label="Clear canvas" onClick={onClear}><Trash2 className="size-4" /></Button>
    </div>}
  </div>
}
