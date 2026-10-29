import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Empty, ErrorBox, PageHeader, Spinner, Tabs, useApi } from '../../components/ui'
import { qs } from '../../api'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

const TABS = [
  { value: '', label: 'All projects' },
  { value: 'Pending', label: 'Pending approvals' },
  { value: 'Approved', label: 'Active projects' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
]

export default function ManageProjects() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('status') || ''
  const [q, setQ] = useState('')
  const archived = tab === 'archived'
  const path = `/api/projects${qs({ status: archived ? '' : tab, q, archived: archived || undefined })}`
  const { data, error, loading, reload } = useApi(path)
  const all = useApi('/api/projects')
  useRealtimeEvent('project', () => { reload(true); all.reload(true) })

  const counts = (all.data || []).reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {})
  const tabs = TABS.map(t => ({ ...t, count: t.value === '' ? all.data?.length : t.value === 'archived' ? undefined : counts[t.value] || 0 }))

  return (
    <>
      <PageHeader title="Manage Projects" subtitle="Review submissions, approve or reject them with feedback, and oversee active projects." />
      <div className="toolbar">
        <Tabs tabs={tabs} value={tab} onChange={v => setParams(v ? { status: v } : {})} />
        <input className="input toolbar-search" type="search" placeholder="Search name, description or developer"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search projects" />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data?.length === 0 ? (
        <Empty icon="project" title="No projects here">{tab === 'Pending' ? 'Nothing is waiting for approval.' : 'Try another filter.'}</Empty>
      ) : (
        <div className="table-wrap card flush">
          <table className="table">
            <thead>
              <tr><th>Project</th><th>Developer</th><th>Domain</th><th>Nodes</th><th>Status</th><th>Best accuracy</th><th>Submitted</th><th /></tr>
            </thead>
            <tbody>
              {data?.map(p => (
                <tr key={p.project_id}>
                  <td><Link to={`/admin/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link>
                    <div className="muted clamp">{p.description}</div></td>
                  <td>{p.owner_name}<div className="muted small">{p.owner_organisation}</div></td>
                  <td>{p.domain}</td>
                  <td>{p.cohort_size}</td>
                  <td><Badge status={p.status} /></td>
                  <td>{pct(p.best_accuracy)}</td>
                  <td className="nowrap">{ago(p.created_at)}</td>
                  <td><Link className="btn btn-sm" to={`/admin/projects/${p.project_id}`}>{p.status === 'Pending' ? 'Review' : 'View'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
