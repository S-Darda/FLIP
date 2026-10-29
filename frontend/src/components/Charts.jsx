import { useEffect, useRef, useState } from 'react'

function useWidth(fallback = 600) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1 }
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0
  const start = Math.floor(min / step) * step
  const ticks = []
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(10))
  return ticks
}

/**
 * Multi-series line chart. series: [{ name, color, points: [{x, y}] }]
 * Hovering shows every series' value at the nearest x.
 */
export function LineChart({ series, height = 240, yFormat = v => v, xLabel = '', yDomain, emptyText = 'No data yet' }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const all = series.flatMap(s => s.points)
  if (!all.length) return <div ref={ref} className="chart-empty" style={{ height }}>{emptyText}</div>

  const pad = { l: 46, r: 14, t: 12, b: xLabel ? 36 : 24 }
  const xs = all.map(p => p.x)
  const ys = all.map(p => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  let [yMin, yMax] = yDomain || [Math.min(...ys), Math.max(...ys)]
  if (!yDomain) { const m = (yMax - yMin) * 0.08 || 0.1; yMin -= m; yMax += m }
  const ticks = niceTicks(yMin, yMax)
  yMin = Math.min(yMin, ticks[0]); yMax = Math.max(yMax, ticks[ticks.length - 1])
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b
  const sx = x => pad.l + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw)
  const sy = y => pad.t + ih - ((y - yMin) / (yMax - yMin)) * ih
  const xTicks = niceTicks(xMin, xMax, Math.min(6, xMax - xMin || 1)).filter(t => t >= xMin && t <= xMax && Number.isInteger(t))

  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const x = xMin + ((px - pad.l) / iw) * (xMax - xMin)
    const nearest = xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), xs[0])
    setHover(nearest)
  }

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
           aria-label={series.map(s => s.name).join(', ')}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={pad.l - 8} y={sy(t)} className="axis" textAnchor="end" dominantBaseline="middle">{yFormat(t)}</text>
          </g>
        ))}
        {xTicks.map(t => <text key={t} x={sx(t)} y={height - pad.b + 16} className="axis" textAnchor="middle">{t}</text>)}
        {xLabel && <text x={pad.l + iw / 2} y={height - 4} className="axis" textAnchor="middle">{xLabel}</text>}
        {series.map(s => s.points.length > 0 && (
          <g key={s.name}>
            <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('')}
                  fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dashed ? '4 4' : undefined}
                  strokeLinejoin="round" strokeLinecap="round" />
            {s.points.length <= 40 && !s.dashed && s.points.map(p => (
              <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={hover === p.x ? 4 : 2.2} fill={s.color} />
            ))}
          </g>
        ))}
        {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + ih} className="crosshair" />}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(sx(hover) + 10, width - 170) }}>
          <strong>{xLabel || 'x'} {hover}</strong>
          {series.map(s => {
            const p = s.points.find(q => q.x === hover)
            return p && <div key={s.name}><i style={{ background: s.color }} />{s.name}: {yFormat(p.y)}</div>
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  )
}

/** Vertical bars. data: [{ label, value, color? }] */
export function BarChart({ data, height = 200, color = 'var(--c1)', yFormat = v => v, labelEvery = 1 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  if (!data.length) return <div ref={ref} className="chart-empty" style={{ height }}>No data yet</div>
  const pad = { l: 36, r: 8, t: 10, b: 24 }
  const max = Math.max(1, ...data.map(d => d.value))
  const ticks = niceTicks(0, max, 3)
  const top = ticks[ticks.length - 1]
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b
  const bw = iw / data.length
  const every = Math.max(labelEvery, Math.ceil(46 / bw))
  const sy = v => pad.t + ih - (v / top) * ih
  return (
    <div ref={ref} className="chart">
      <svg width={width} height={height} role="img" aria-label="bar chart">
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={pad.l - 6} y={sy(t)} className="axis" textAnchor="end" dominantBaseline="middle">{yFormat(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
            <rect x={pad.l + i * bw + bw * 0.18} y={sy(d.value)} width={bw * 0.64} height={Math.max(0, pad.t + ih - sy(d.value))}
                  rx="3" fill={d.color || color} opacity={hover === null || hover === i ? 1 : 0.55} />
            {i % every === 0 && (
              <text x={pad.l + i * bw + bw / 2} y={height - 6} className="axis" textAnchor="middle">{d.label}</text>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(pad.l + hover * bw + bw / 2, width - 150) }}>
          <strong>{data[hover].tip || data[hover].label}</strong><div>{yFormat(data[hover].value)}</div>
        </div>
      )}
    </div>
  )
}

/** Horizontal bars, good for per-node or per-feature comparisons. */
export function HBars({ data, format = v => v, max }) {
  const top = max ?? Math.max(...data.map(d => d.value), 0.0001)
  return (
    <div className="hbars">
      {data.map(d => (
        <div key={d.label} className="hbar">
          <span className="hbar-label" title={d.label}>{d.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(d.value / top) * 100}%`, background: d.color }} /></span>
          <span className="hbar-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Ring showing parts of a whole. data: [{ label, value, color }] */
export function Donut({ data, size = 150, label }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = size / 2 - 12, c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
        {total > 0 && data.map(d => {
          const len = (d.value / total) * c
          const el = (
            <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth="16"
                    strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
          offset += len
          return el
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-total">{total}</text>
        <text x="50%" y="62%" textAnchor="middle" className="axis">{label}</text>
      </svg>
      <ul className="donut-legend">
        {data.map(d => <li key={d.label}><i style={{ background: d.color }} />{d.label}<b>{d.value}</b></li>)}
      </ul>
    </div>
  )
}

/** Confusion matrix heat-map: rows are actual classes, columns predicted. */
export function ConfusionMatrix({ matrix, classes }) {
  const max = Math.max(1, ...matrix.flat())
  return (
    <div className="cm-wrap">
      <div className="cm-axis-y">Actual</div>
      <div>
        <div className="cm-axis-x">Predicted</div>
        <table className="cm">
          <thead><tr><th />{classes.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={classes[i]}>
                <th scope="row">{classes[i]}</th>
                {row.map((v, j) => {
                  const a = v / max
                  return (
                    <td key={j} className={i === j ? 'diag' : ''}
                        style={{ background: `color-mix(in srgb, var(--cm) ${Math.round(a * 85 + 5)}%, transparent)`,
                                 color: a > 0.55 ? '#fff' : undefined }}>
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const SERIES_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)']
