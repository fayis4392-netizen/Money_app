import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* Small, dependency-free charts. Thin marks, recessive grid, a hover tooltip on every mark. */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** A round gridline step (1, 2 or 5 × 10ⁿ) giving about four lines up to `max`. */
function niceStep(max: number) {
  if (max <= 0) return 1
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}
const niceMax = (max: number) => Math.ceil(max / niceStep(max)) * niceStep(max) || 1

/** Short axis numbers in the Indian style: 2.5L, 1.2Cr, 45K. */
function compactInr(n: number) {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e7) return `${s}${+(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`
  if (a >= 1e5) return `${s}${+(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`
  if (a >= 1e3) return `${s}${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return `${s}${Math.round(a)}`
}

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70)
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg" style={{ left, top: y - 8 }}>
      {children}
    </div>
  )
}

export interface Point { key: string; label: string; value: number; detail?: string }

/** Columns over time (one series). Negative values hang below the zero line. */
export function ColumnChart({ points, format, axis = compactInr, color = 'var(--series-1)', height = 190, name }: { points: Point[]; format: (n: number) => string; axis?: (n: number) => string; color?: string; height?: number; name: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 44, padB = 22, padT = 8
  const plotW = Math.max(0, w - padL), plotH = height - padB - padT
  const hi = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const lo = Math.min(0, ...points.map((p) => p.value)) < 0 ? -niceMax(-Math.min(...points.map((p) => p.value))) : 0
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * plotH
  const slot = points.length ? plotW / points.length : 0
  const bw = Math.max(2, Math.min(28, slot - 2)) // 2px surface gap between neighbours
  const step = niceStep(Math.max(hi, -lo))
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step)
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56))))
  const r = Math.min(4, bw / 2)
  const bar = (i: number, v: number) => {
    const x = padL + i * slot + (slot - bw) / 2, y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0)
    if (h < 0.5) return ''
    const rr = Math.min(r, h)
    // rounded at the data end, square at the baseline
    return v >= 0
      ? `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + bw - rr} Q${x + bw},${y1} ${x + bw},${y1 + rr} V${y0} Z`
      : `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + bw - rr} Q${x + bw},${y1} ${x + bw},${y1 - rr} V${y0} Z`
  }
  const total = points.reduce((t, p) => t + p.value, 0)
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${name}: ${points.length} periods, total ${format(total)}`} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border)' : 'var(--grid)'} strokeWidth={1} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">{axis(t)}</text>
            </g>
          ))}
          {points.map((p, i) => (
            <path key={p.key} d={bar(i, p.value)} fill={color} opacity={hover == null || hover === i ? 1 : 0.45} />
          ))}
          {points.map((p, i) =>
            i % every === 0 ? <text key={'l' + p.key} x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">{p.label}</text> : null,
          )}
          {points.map((p, i) => (
            // hit target wider and taller than the mark
            <rect key={'h' + p.key} x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hover != null && points[hover] && (
        <Tip x={padL + hover * slot + slot / 2} y={y(Math.max(0, points[hover].value))} width={w}>
          <div className="font-semibold">{points[hover].label}</div>
          <div className="tabular-nums">{format(points[hover].value)}</div>
          {points[hover].detail && <div className="text-muted">{points[hover].detail}</div>}
        </Tip>
      )}
    </div>
  )
}

/** A rate over time, held flat until it changes (step line), with a crosshair tooltip. */
export function StepLine({ points, format, height = 150, name, until }: { points: { at: string; value: number }[]; format: (n: number) => string; height?: number; name: string; until: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) return <p className="py-6 text-center text-sm text-muted">No rate updates in this period</p>
  const padL = 44, padB = 22, padT = 10
  const t0 = new Date(points[0].at).getTime(), t1 = Math.max(new Date(until).getTime(), t0 + 1)
  const vals = points.map((p) => p.value)
  const span = Math.max(...vals) - Math.min(...vals) || 1
  const lo = Math.min(...vals) - span * 0.25, hi = Math.max(...vals) + span * 0.25
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - 8)
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (height - padB - padT)
  let d = ''
  points.forEach((p, i) => {
    const px = x(new Date(p.at).getTime()), py = y(p.value)
    d += i === 0 ? `M${px},${py}` : ` H${px} V${py}`
  })
  d += ` H${x(t1)}`
  const ticks = [lo + (hi - lo) * 0.2, (lo + hi) / 2, lo + (hi - lo) * 0.8]
  const fmtDay = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const nearest = (mx: number) => {
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(new Date(p.at).getTime()) - mx) < Math.abs(x(new Date(points[best].at).getTime()) - mx)) best = i
    })
    return best
  }
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${name}: from ${format(points[0].value)} to ${format(points.at(-1)!.value)}`} className="block overflow-visible"
          onMouseMove={(e) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
          onTouchStart={(e) => setHover(nearest(e.touches[0].clientX - e.currentTarget.getBoundingClientRect().left))}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">{format(t)}</text>
            </g>
          ))}
          <text x={padL} y={height - 6} className="fill-muted text-[10px]">{fmtDay(points[0].at)}</text>
          <text x={w - 8} y={height - 6} textAnchor="end" className="fill-muted text-[10px]">{fmtDay(until)}</text>
          <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
          {hover != null && <line x1={x(new Date(points[hover].at).getTime())} x2={x(new Date(points[hover].at).getTime())} y1={padT} y2={height - padB} stroke="var(--border)" />}
          {points.map((p, i) => (
            <circle key={p.at + i} cx={x(new Date(p.at).getTime())} cy={y(p.value)} r={hover === i ? 5 : 4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          ))}
        </svg>
      )}
      {hover != null && (
        <Tip x={x(new Date(points[hover].at).getTime())} y={y(points[hover].value)} width={w}>
          <div className="font-semibold">{new Date(points[hover].at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          <div className="tabular-nums">{format(points[hover].value)}</div>
        </Tip>
      )}
    </div>
  )
}

/** Ranked horizontal bars with the value written beside each (no tooltip needed). */
export function BarList({ rows, format, empty = 'Nothing yet' }: { rows: { label: ReactNode; value: number; sub?: string; key: string }[]; format: (n: number) => string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1)
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1 text-sm" title={r.sub}>
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className={cn('shrink-0 font-semibold tabular-nums', r.value < 0 && 'text-neg')}>{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className={cn('h-2 rounded-full', r.value < 0 ? 'bg-neg' : 'bg-series-1')} style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }} />
          </div>
          {r.sub && <div className="text-xs text-muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}

/** One bar split into parts, with a legend that carries the counts (identity never by colour alone). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0)
  return (
    <div className="grid gap-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <div key={p.label} title={`${p.label}: ${p.value}`} style={{ flexGrow: p.value, background: p.color }} />)}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="flex-1 text-muted">{p.label}</span>
            <b className="tabular-nums">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One series over days, as a line with a soft area under it, a crosshair and a tooltip. Tight y-scale so small moves show. */
export function AreaLine({ points, format, height = 200, name, color = 'var(--series-1)' }: { points: { label: string; value: number }[]; format: (n: number) => string; height?: number; name: string; color?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const id = 'area-' + name.replace(/\W/g, '')
  if (points.length < 2) return <div ref={ref} className="grid place-items-center text-sm text-muted" style={{ height }}>Not enough days yet</div>
  const padL = 52, padR = 10, padT = 12, padB = 22
  const vals = points.map((p) => p.value)
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), span = hi0 - lo0 || Math.abs(hi0) * 0.002 || 1
  const lo = lo0 - span * 0.25, hi = hi0 + span * 0.25
  const x = (i: number) => padL + (i / (points.length - 1)) * (w - padL - padR)
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (height - padT - padB)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${height - padB} L${x(0)},${height - padB} Z`
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, lo + (hi - lo) * 0.85]
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((w - padL) / 60))))
  const at = (clientX: number, el: Element) => {
    const mx = clientX - el.getBoundingClientRect().left
    return Math.max(0, Math.min(points.length - 1, Math.round(((mx - padL) / (w - padL - padR)) * (points.length - 1))))
  }
  const hv = hover ?? points.length - 1
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${name}: from ${format(points[0].value)} to ${format(points.at(-1)!.value)}`} className="block touch-pan-y"
          onMouseMove={(e) => setHover(at(e.clientX, e.currentTarget))}
          onTouchMove={(e) => setHover(at(e.touches[0].clientX, e.currentTarget))}
          onTouchStart={(e) => setHover(at(e.touches[0].clientX, e.currentTarget))}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">{format(t)}</text>
            </g>
          ))}
          <path d={area} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => ((i % every === 0 && points.length - 1 - i >= every * 0.6) || i === points.length - 1 ? <text key={p.label + i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-muted text-[10px]">{p.label}</text> : null))}
          <line x1={x(hv)} x2={x(hv)} y1={padT} y2={height - padB} stroke="var(--border)" strokeDasharray={hover == null ? '3 3' : undefined} />
          <circle cx={x(hv)} cy={y(points[hv].value)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
      {hover != null && (
        <Tip x={x(hover)} y={y(points[hover].value)} width={w}>
          <div className="font-semibold">{points[hover].label}</div>
          <div className="tabular-nums">{format(points[hover].value)}</div>
        </Tip>
      )}
    </div>
  )
}

/** A tiny line for a tile, no axes. */
export function Sparkline({ values, width = 96, height = 28, color = 'var(--series-1)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - lo) / span) * (height - 6)}`).join(' ')
  return (
    <svg width={width} height={height} aria-hidden className="block">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
