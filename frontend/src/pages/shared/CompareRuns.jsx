import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { LineChart, SERIES_COLORS } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Empty, ErrorBox, PageHeader, Panel, Skeleton, Tabs, useApi } from '../../components/ui'
import { pct } from '../../format'

const MAX = 4
const MEDALS = ['#fcd34d', '#d1d5db', '#fdba74']
const f3 = v => (v == null ? '—' : v.toFixed(3))

const METRICS = {
  classification: [
    ['Accuracy', r => r.accuracy, pct, 'max'], ['Macro F1', r => r.report?.f1, f3, 'max'], ['Macro AUROC', r => r.report?.auroc, f3, 'max'],
    ['Calibration error', r => r.report?.ece, f3, 'min'], ['Final loss', r => r.loss, f3, 'min'],
  ],
  regression: [
    ['RMSE', r => r.rmse, f3, 'min'], ['MAE', r => r.report?.mae, f3, 'min'], ['R²', r => r.report?.r2, f3, 'max'], ['Final loss', r => r.loss, f3, 'min'],
  ],
}
const SETUP = [
  ['Mode', r => r.mode_label], ['Sites', r => r.num_nodes], ['Rounds', r => r.rounds], ['Model', r => r.model_label],
  ['Aggregation', r => r.algorithm], ['Learning rate', r => r.learning_rate], ['Local epochs', r => r.local_epochs],
  ['DP', r => (r.dp_enabled ? `noise ${r.noise_multiplier}` : 'off')], ['ε spent', r => f3(r.report?.privacy?.epsilon)],
]

export default function CompareRuns({ admin }) {
  const base = admin ? '/admin' : '/app'
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('ids') ? 'compare' : 'leaderboard')
  const [task, setTask] = useState('classification')
  const { data: runs, error, loading, reload } = useApi('/api/training?status=Completed')
  const [details, setDetails] = useState({})
  const requested = useRef(new Set())

  const better = task === 'regression' ? (a, b) => (a.rmse ?? 1e9) - (b.rmse ?? 1e9) : (a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)
  const ranked = useMemo(() => (runs || []).filter(r => r.task_type === task).sort(better), [runs, task])
  const ids = useMemo(() => {
    const fromUrl = (params.get('ids') || '').split(',').map(Number).filter(Boolean)
    return fromUrl.length ? fromUrl.slice(0, MAX) : ranked.slice(0, 3).map(r => r.training_id)
  }, [params, ranked])
  useEffect(() => {
    const first = (runs || []).find(r => r.training_id === ids[0])
    if (first && first.task_type !== task) setTask(first.task_type)
  }, [runs, ids])
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
  const chosen = ids.map(id => details[id]).filter(r => r && r.task_type === task)
  const color = id => SERIES_COLORS[ids.indexOf(id) % SERIES_COLORS.length]
  const key = task === 'regression' ? 'rmse' : 'accuracy'
  const headline = r => (task === 'regression' ? `RMSE ${f3(r.rmse)}` : pct(r.accuracy))

  return (
    <>
      <PageHeader title="Compare and Leaderboard" subtitle="Rank completed runs, then overlay up to four to see which settings win."
                  actions={<Tabs value={task} onChange={v => { setTask(v); setParams({}, { replace: true }) }}
                                 tabs={[{ value: 'classification', label: 'Classification' }, { value: 'regression', label: 'Regression' }]} />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'leaderboard', label: 'Leaderboard', count: ranked.length }, { value: 'compare', label: 'Compare runs', count: chosen.length }]} />
      {ranked.length === 0 ? <Empty icon="trophy" title={`No completed ${task} runs yet`} /> : tab === 'leaderboard' ? (
        <>
          <div className="podium">
            {ranked.slice(0, 3).map((r, i) => (
              <Link key={r.training_id} to={`${base}/training/${r.training_id}`} className="podium-item" style={{ textDecoration: 'none' }}>
                <div className="podium-medal" style={{ background: MEDALS[i] }}>{i + 1}</div>
                <div className="podium-acc">{headline(r)}</div>
                <strong>{r.project_name}</strong>
                <div className="muted small">#{r.training_id} · {r.mode_label} · {r.model_label}</div>
              </Link>
            ))}
          </div>
          <Panel className="fill" flush>
            <table className="table">
              <thead><tr><th>Rank</th><th>Run</th><th>Study</th><th>Setup</th><th>{task === 'regression' ? 'RMSE' : 'Accuracy'}</th><th>Loss</th><th /></tr></thead>
              <tbody>{ranked.map((r, i) => (
                <tr key={r.training_id} className={i === 0 ? 'best' : ''}>
                  <td><strong>{i + 1}</strong></td>
                  <td><Link to={`${base}/training/${r.training_id}`}>#{r.training_id}</Link>{r.is_best && ' ★'}</td>
                  <td>{r.project_name}</td>
                  <td className="small">{r.mode_label} · {r.algorithm} · {r.model_label}<div className="muted">{r.num_nodes} sites · {r.rounds} rounds{r.dp_enabled ? ' · DP' : ''}</div></td>
                  <td><strong>{task === 'regression' ? f3(r.rmse) : pct(r.accuracy)}</strong></td>
                  <td className="mono">{f3(r.loss)}</td>
                  <td><button className="btn btn-sm" onClick={() => { if (!ids.includes(r.training_id)) toggle(r.training_id); setTab('compare') }}>Compare</button></td>
                </tr>
              ))}</tbody>
            </table>
          </Panel>
        </>
      ) : (
        <div className="fill grid-side">
          <div className="rows-2">
            <div className="grid-2" style={{ minHeight: 0 }}>
              <Panel title={task === 'regression' ? 'Validation RMSE per round' : 'Validation accuracy per round'}>
                <LineChart height={190} xLabel="Round" yFormat={v => (task === 'regression' ? v.toFixed(1) : pct(v, 0))} emptyText="Pick runs on the right"
                           series={chosen.map(r => ({ name: `#${r.training_id}`, color: color(r.training_id), points: r.round_metrics.map(m => ({ x: m.round, y: m[key] })).filter(p => p.y != null) }))} />
              </Panel>
              <Panel title="Validation loss per round">
                <LineChart height={190} xLabel="Round" yFormat={v => v.toFixed(2)} emptyText="Pick runs on the right"
                           series={chosen.map(r => ({ name: `#${r.training_id}`, color: color(r.training_id), points: r.round_metrics.map(m => ({ x: m.round, y: m.loss })) }))} />
              </Panel>
            </div>
            <Panel title="Side by side" subtitle="best value per row in green" flush>
              {chosen.length === 0 ? <p className="muted" style={{ padding: '.8rem .9rem' }}>Pick runs on the right.</p> : (
                <table className="table">
                  <thead><tr><th>Metric</th>{chosen.map(r => <th key={r.training_id}><i className="swatch" style={{ background: color(r.training_id) }} />#{r.training_id}</th>)}</tr></thead>
                  <tbody>
                    {METRICS[task].map(([label, get, fmt, dir]) => {
                      const vals = chosen.map(get)
                      const nums = vals.filter(v => typeof v === 'number')
                      const best = nums.length > 1 ? (dir === 'max' ? Math.max(...nums) : Math.min(...nums)) : null
                      return <tr key={label}><td className="muted">{label}</td>{vals.map((v, i) => (
                        <td key={i} style={v === best ? { fontWeight: 700, color: 'var(--green)' } : undefined}>{fmt(v)}{v === best && <> <Icon name="trophy" size={12} /></>}</td>))}</tr>
                    })}
                    {SETUP.map(([label, get]) => <tr key={label}><td className="muted">{label}</td>{chosen.map(r => <td key={r.training_id}>{get(r)}</td>)}</tr>)}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
          <Panel title="Runs" subtitle={`${chosen.length}/${MAX} selected`}>
            <div className="pick-list">
              {ranked.map(r => {
                const on = ids.includes(r.training_id)
                return (
                  <label key={r.training_id} className={`pick ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r.training_id)} />
                    {on && <i className="swatch" style={{ background: color(r.training_id) }} />}
                    <span><strong>#{r.training_id}</strong> {r.project_name}<small>{r.mode_label} · {r.model_label} · {r.num_nodes} sites</small></span>
                    <span className="pick-acc">{headline(r)}</span>
                  </label>
                )
              })}
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}
