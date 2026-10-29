import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { LineChart, SERIES_COLORS } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Empty, ErrorBox, PageHeader, Skeleton, Tabs, useApi } from '../../components/ui'
import { num, pct } from '../../format'

const MAX = 4
const MEDALS = ['linear-gradient(135deg,#fde68a,#f59e0b)', 'linear-gradient(135deg,#e5e7eb,#9ca3af)', 'linear-gradient(135deg,#fdba74,#c2410c)']

/** Rows of the comparison table: label, value getter, formatter, and which direction is better. */
const METRICS = [
  ['Accuracy', r => r.accuracy, v => pct(v), 'max'],
  ['F1 score (macro)', r => r.report?.f1, v => v?.toFixed(3) ?? '—', 'max'],
  ['Precision (macro)', r => r.report?.precision, v => v?.toFixed(3) ?? '—', 'max'],
  ['Recall (macro)', r => r.report?.recall, v => v?.toFixed(3) ?? '—', 'max'],
  ['Final loss', r => r.loss, v => v?.toFixed(4) ?? '—', 'min'],
  ['Rounds', r => r.rounds, v => v, null],
  ['Nodes', r => r.num_nodes, v => v, null],
  ['Aggregation', r => r.algorithm + (r.algorithm === 'FedProx' ? ` (μ ${r.mu})` : ''), v => v, null],
  ['Model', r => r.model_label, v => v, null],
  ['Local epochs', r => r.local_epochs, v => v, null],
  ['Learning rate', r => r.learning_rate, v => v, null],
  ['Differential privacy', r => (r.dp_enabled ? `noise ${r.noise_multiplier}` : 'off'), v => v, null],
  ['Privacy budget ε', r => r.report?.privacy_epsilon, v => (v == null ? '—' : v.toFixed(1)), 'min'],
  ['Samples', r => (r.report ? r.report.train_samples + r.report.test_samples : null), v => num(v), null],
]

export default function CompareRuns({ admin }) {
  const base = admin ? '/admin' : '/app'
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('ids') ? 'compare' : 'leaderboard')
  const { data: runs, error, loading, reload } = useApi('/api/training?status=Completed')
  const [details, setDetails] = useState({})

  const ranked = useMemo(() => [...(runs || [])].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)), [runs])
  const ids = useMemo(() => {
    const fromUrl = (params.get('ids') || '').split(',').map(Number).filter(Boolean)
    return fromUrl.length ? fromUrl.slice(0, MAX) : ranked.slice(0, 3).map(r => r.training_id)
  }, [params, ranked])

  const requested = useRef(new Set())
  useEffect(() => {
    ids.filter(id => !requested.current.has(id)).forEach(id => {
      requested.current.add(id)
      api(`/api/training/${id}`).then(d => setDetails(m => ({ ...m, [id]: d }))).catch(() => requested.current.delete(id))
    })
  }, [ids])

  const toggle = id => {
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-MAX)
    setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
  }

  if (loading && !runs) return <Skeleton rows={2} />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const chosen = ids.map(id => details[id]).filter(Boolean)
  const color = id => SERIES_COLORS[ids.indexOf(id) % SERIES_COLORS.length]

  return (
    <>
      <PageHeader title="Compare and Leaderboard"
                  subtitle="Rank every completed federated run, then overlay up to four side by side to see which settings win." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'leaderboard', label: 'Leaderboard', count: ranked.length }, { value: 'compare', label: 'Compare runs', count: ids.length }]} />

      {ranked.length === 0 ? (
        <Empty icon="trophy" title="No completed runs yet">Finish a training run and it will appear here.</Empty>
      ) : tab === 'leaderboard' ? (
        <>
          <div className="podium">
            {ranked.slice(0, 3).map((r, i) => (
              <Link key={r.training_id} to={`${base}/training/${r.training_id}`} className="podium-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="podium-medal" style={{ background: MEDALS[i] }}>{i + 1}</div>
                <div className="podium-acc grad-text">{pct(r.accuracy)}</div>
                <strong>{r.project_name}</strong>
                <div className="muted small">#{r.training_id} · {r.algorithm} · {r.model_label} · {r.num_nodes} nodes</div>
              </Link>
            ))}
          </div>
          <div className="table-wrap card flush">
            <table className="table">
              <thead><tr><th>Rank</th><th>Run</th><th>Project</th><th>Setup</th><th>Accuracy</th><th>Loss</th><th /></tr></thead>
              <tbody>{ranked.map((r, i) => (
                <tr key={r.training_id} className={i === 0 ? 'best' : ''} style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}>
                  <td><strong>{i + 1}</strong>{i < 3 && <Icon name="trophy" size={14} className="muted" />}</td>
                  <td><Link to={`${base}/training/${r.training_id}`}>#{r.training_id}</Link></td>
                  <td>{r.project_name}{admin && <div className="muted small">{r.started_by_name}</div>}</td>
                  <td className="small">{r.algorithm} · {r.model_label}<div className="muted">{r.num_nodes} nodes · {r.rounds} rounds{r.dp_enabled ? ' · DP' : ''}</div></td>
                  <td><strong>{pct(r.accuracy)}</strong></td>
                  <td className="mono">{r.loss?.toFixed(4)}</td>
                  <td><button className="btn btn-sm" onClick={() => { if (!ids.includes(r.training_id)) toggle(r.training_id); setTab('compare') }}>Compare</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid-main">
          <div>
            <section className="card">
              <h2 className="card-title">Accuracy per round</h2>
              <LineChart xLabel="Round" yFormat={v => pct(v, 0)} emptyText="Pick runs on the right"
                         series={chosen.map(r => ({ name: `#${r.training_id} ${r.project_name}`, color: color(r.training_id), points: r.round_metrics.map(m => ({ x: m.round, y: m.accuracy })) }))} />
            </section>
            <section className="card">
              <h2 className="card-title">Loss per round</h2>
              <LineChart xLabel="Round" yFormat={v => v.toFixed(2)} emptyText="Pick runs on the right"
                         series={chosen.map(r => ({ name: `#${r.training_id} ${r.project_name}`, color: color(r.training_id), points: r.round_metrics.map(m => ({ x: m.round, y: m.loss })) }))} />
            </section>
            {chosen.length > 0 && (
              <section className="card flush">
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Metric</th>{chosen.map(r => (
                      <th key={r.training_id}><i className="swatch" style={{ background: color(r.training_id), color: color(r.training_id) }} />#{r.training_id}</th>
                    ))}</tr></thead>
                    <tbody>{METRICS.map(([label, get, fmt, better]) => {
                      const vals = chosen.map(get)
                      const numeric = vals.filter(v => typeof v === 'number')
                      const best = better && numeric.length > 1 ? (better === 'max' ? Math.max(...numeric) : Math.min(...numeric)) : null
                      return (
                        <tr key={label}>
                          <td className="muted">{label}</td>
                          {vals.map((v, i) => (
                            <td key={chosen[i].training_id} style={v === best ? { fontWeight: 700, color: 'var(--green)' } : undefined}>
                              {fmt(v)}{v === best && <> <Icon name="trophy" size={13} /></>}
                            </td>
                          ))}
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
          <aside className="card">
            <h2 className="card-title">Runs <small>{ids.length}/{MAX} selected</small></h2>
            <div className="pick-list">
              {ranked.map(r => {
                const on = ids.includes(r.training_id)
                return (
                  <label key={r.training_id} className={`pick ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r.training_id)} />
                    {on && <i className="swatch" style={{ background: color(r.training_id), color: color(r.training_id) }} />}
                    <span><strong>#{r.training_id}</strong> {r.project_name}<small>{r.algorithm} · {r.model_label} · {r.num_nodes} nodes{r.dp_enabled ? ' · DP' : ''}</small></span>
                    <span className="pick-acc">{pct(r.accuracy)}</span>
                  </label>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
