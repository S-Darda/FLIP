import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { qs } from '../../api'
import { Badge, Empty, ErrorBox, PageHeader, Panel, Spinner, Tabs, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

const TABS = [
  { value: '', label: 'All studies' },
  { value: 'Pending', label: 'Pending approvals' },
  { value: 'Approved', label: 'Active' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
]

export default function ManageProjects() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('status') || ''
  const [q, setQ] = useState('')
  const archived = tab === 'archived'
  const { data, error, loading, reload } = useApi(`/api/projects${qs({ status: archived ? '' : tab, q, archived: archived || undefined })}`)
  const all = useApi('/api/projects')
  useRealtimeEvent('project', () => { reload(true); all.reload(true) })
  const counts = (all.data || []).reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {})
  const tabs = TABS.map(t => ({ ...t, count: t.value === '' ? all.data?.length : t.value === 'archived' ? undefined : counts[t.value] || 0 }))

  return (
    <>
      <PageHeader title="Manage Studies" subtitle="Review submissions, approve or reject with feedback, and oversee active studies." />
      <div className="toolbar">
        <Tabs tabs={tabs} value={tab} onChange={v => setParams(v ? { status: v } : {})} />
        <input className="input toolbar-search" type="search" placeholder="Search name, description or developer"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search studies" />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Panel className="fill" flush>
        {loading && !data ? <Spinner /> : data?.length === 0 ? (
          <Empty icon="project" title="No studies here">{tab === 'Pending' ? 'Nothing is waiting for approval.' : 'Try another filter.'}</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Study</th><th>Developer</th><th>Mode</th><th>Task</th><th>Sites</th><th>Privacy</th><th>Status</th><th>Best</th><th>Submitted</th><th /></tr></thead>
            <tbody>
              {data?.map(p => (
                <tr key={p.project_id}>
                  <td><Link to={`/admin/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link><div className="muted clamp">{p.description}</div></td>
                  <td>{p.owner_name}<div className="muted small">{p.owner_organisation}</div></td>
                  <td className="small">{p.mode_label}</td>
                  <td className="small">{p.task_type}{p.target && <div className="muted mono">{p.target}</div>}</td>
                  <td>{p.mode === 'simulation' ? <span className="muted">{p.cohort_size} sim.</span> : p.site_ids.length}</td>
                  <td className="small">{p.dp_required ? 'DP required' : 'optional'}{p.max_epsilon && <div className="muted">ε ≤ {p.max_epsilon}</div>}</td>
                  <td><Badge status={p.status} /></td>
                  <td>{p.task_type === 'regression' ? (p.best_rmse?.toFixed(3) ?? '—') : pct(p.best_accuracy)}</td>
                  <td className="nowrap">{ago(p.created_at)}</td>
                  <td><Link className="btn btn-sm" to={`/admin/projects/${p.project_id}`}>{p.status === 'Pending' ? 'Review' : 'View'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
