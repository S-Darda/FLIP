import { useEffect, useMemo, useRef, useState } from 'react'
import { pct } from '../format'

const W = 560
const H = 380
const HUB = { x: W / 2, y: H / 2 }

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Red → amber → green as accuracy goes from 40% to 95%. */
function accColor(acc) {
  if (acc == null) return 'var(--border-strong)'
  const t = Math.max(0, Math.min(1, (acc - 0.4) / 0.55))
  return `hsl(${Math.round(t * 145)} 72% 52%)`
}

function layout(n) {
  const rx = Math.min(215, 120 + n * 12)
  const ry = Math.min(140, 95 + n * 6)
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: HUB.x + rx * Math.cos(a), y: HUB.y + ry * Math.sin(a) }
  })
}

/**
 * Live picture of one federated round. Each selected node sends its update to the
 * coordinator (packet in), which then broadcasts the new global weights (packet out).
 * nodes: [{ name, accuracy, selected, train_samples }]
 */
export default function NetworkViz({ nodes, round, accuracy, active, title = 'Global model' }) {
  const pos = useMemo(() => layout(nodes.length), [nodes.length])
  const maxSamples = Math.max(1, ...nodes.map(n => n.train_samples || 1))
  const animate = active && !reducedMotion()
  // SMIL begin times count from the SVG's own clock, so offset new packets from "now".
  const svgRef = useRef(null)
  const t0 = svgRef.current?.getCurrentTime?.() ?? 0
  const at = d => `${(t0 + d).toFixed(2)}s`

  return (
    <div className="netviz">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Federation of ${nodes.length} nodes, round ${round}`}>
        <defs>
          <radialGradient id="hub-grad" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#0e7490" />
          </radialGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {nodes.map((n, i) => (
          <line key={`l${n.name}`} className={`link ${n.selected ? 'on' : ''}`} x1={pos[i].x} y1={pos[i].y} x2={HUB.x} y2={HUB.y} />
        ))}

        {animate && nodes.map((n, i) => n.selected && (
          <g key={`p${n.name}-${round}`}>
            <circle r="5" fill="var(--a3)" filter="url(#soft-glow)" opacity="0">
              <animateMotion dur="0.75s" begin={at(i * 0.06)} fill="freeze" path={`M${pos[i].x},${pos[i].y} L${HUB.x},${HUB.y}`} />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="0.75s" begin={at(i * 0.06)} fill="freeze" />
            </circle>
            <circle r="4" fill="var(--a4)" filter="url(#soft-glow)" opacity="0">
              <animateMotion dur="0.7s" begin={at(0.9 + i * 0.04)} fill="freeze" path={`M${HUB.x},${HUB.y} L${pos[i].x},${pos[i].y}`} />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="0.7s" begin={at(0.9 + i * 0.04)} fill="freeze" />
            </circle>
          </g>
        ))}

        <g>
          {active && <circle className="hub-halo" cx={HUB.x} cy={HUB.y} r="50" fill="none" stroke="var(--a2)" strokeWidth="2" />}
          {animate && <circle key={`f${round}`} className="flash" cx={HUB.x} cy={HUB.y} r="50" fill="var(--a2)" style={{ animationDelay: '.75s' }} />}
          <circle cx={HUB.x} cy={HUB.y} r="50" fill="url(#hub-grad)" filter="url(#soft-glow)" />
          <text className="hub-label" x={HUB.x} y={HUB.y - 4} textAnchor="middle">{accuracy != null ? pct(accuracy) : '—'}</text>
          <text className="hub-sub" x={HUB.x} y={HUB.y + 14} textAnchor="middle">{title}</text>
          <text className="hub-sub" x={HUB.x} y={HUB.y + 28} textAnchor="middle">round {round}</text>
        </g>

        {nodes.map((n, i) => {
          const r = 17 + 9 * Math.sqrt((n.train_samples || maxSamples) / maxSamples)
          const below = pos[i].y >= HUB.y
          return (
            <g key={n.name} className={`node-g ${n.selected === false ? 'idle' : ''}`}>
              {animate && n.selected && <circle key={`nf${round}`} className="flash" cx={pos[i].x} cy={pos[i].y} r={r} fill={accColor(n.accuracy)} style={{ animationDelay: '1.5s' }} />}
              <circle className="node-core" cx={pos[i].x} cy={pos[i].y} r={r} />
              <circle className="node-ring" cx={pos[i].x} cy={pos[i].y} r={r} stroke={accColor(n.accuracy)} />
              <text className="node-sub" x={pos[i].x} y={pos[i].y + 4} textAnchor="middle">{n.accuracy != null ? Math.round(n.accuracy * 100) : '·'}</text>
              <text className="node-label" x={pos[i].x} y={below ? pos[i].y + r + 16 : pos[i].y - r - 8} textAnchor="middle">{n.name}</text>
            </g>
          )
        })}
      </svg>
      <div className="netviz-legend">
        <span><i style={{ background: 'var(--a3)' }} />update sent to coordinator</span>
        <span><i style={{ background: 'var(--a4)' }} />new global weights</span>
        <span><i style={{ background: accColor(0.92) }} />node accuracy</span>
      </div>
    </div>
  )
}

const DEMO = ['Hospital A', 'Hospital B', 'Bank C', 'Lab D', 'Clinic E', 'Hospital F']

/** Self-running demo for the landing page. */
export function NetworkDemo() {
  const [round, setRound] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setRound(r => (r >= 40 ? 1 : r + 1)), 2200)
    return () => clearInterval(t)
  }, [])
  const nodes = DEMO.map((name, i) => {
    const base = 0.48 + 0.42 * (1 - Math.exp(-round / (5 + i)))
    const wobble = Math.sin(round * 1.7 + i * 2.1) * 0.02
    return { name, accuracy: Math.min(0.97, base + wobble), selected: (round + i) % 5 !== 0, train_samples: 300 + ((i * 137) % 420) }
  })
  const global = nodes.reduce((s, n) => s + n.accuracy, 0) / nodes.length
  return <NetworkViz nodes={nodes} round={round} accuracy={global} active />
}
