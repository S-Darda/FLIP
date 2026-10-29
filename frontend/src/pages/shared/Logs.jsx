import { useEffect, useState } from 'react'
import { download, qs } from '../../api'
import Icon from '../../components/Icon'
import { Badge, Empty, ErrorBox, PageHeader, Spinner, useApi } from '../../components/ui'
import { dateTime } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

const BLANK = { q: '', action: '', level: '', user_id: '', project_id: '', date_from: '', date_to: '' }

export default function Logs({ admin }) {
  const toast = useToast()
  const [filters, setFilters] = useState(BLANK)
  const [debounced, setDebounced] = useState(BLANK)
  const [page, setPage] = useState(1)
  const [live, setLive] = useState(true)
  const pageSize = 50
  useEffect(() => { const t = setTimeout(() => { setDebounced(filters); setPage(1) }, 250); return () => clearTimeout(t) }, [filters])

  const query = qs({ ...debounced, page, page_size: pageSize })
  const { data, error, loading, reload, setData } = useApi(`/api/logs${query}`)
  const actions = useApi('/api/logs/actions')
  const users = useApi(admin ? '/api/users' : null)
  const projects = useApi('/api/projects')

  const filtering = Object.values(debounced).some(Boolean) || page > 1
  useRealtimeEvent('log', e => {
    if (!live) return
    if (filtering) return
    setData(d => d && ({ ...d, total: d.total + 1, items: [e.log, ...d.items].slice(0, pageSize) }))
  })

  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const families = [...new Set((actions.data || []).map(a => a.action.split('.')[0]))]
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const exportCsv = () => download(`/api/logs/export.csv${qs(debounced)}`, 'flip-logs.csv')
    .then(() => toast('Log export downloaded', 'success')).catch(e => toast(e.message, 'error'))

  return (
    <>
      <PageHeader title={admin ? 'Monitoring and Logging' : 'Activity Logs'}
                  subtitle={admin ? 'Every user action and system event, for auditing and incident response.'
                                  : 'Events for your account, projects and training jobs.'}
                  actions={<>
                    <label className="check"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live tail</label>
                    <button className="btn" onClick={exportCsv}><Icon name="download" size={14} /> Export CSV</button>
                  </>} />
      <div className="card filters">
        <input className="input" type="search" placeholder="Search messages" value={filters.q} onChange={set('q')} aria-label="Search messages" />
        <select className="input" value={filters.action} onChange={set('action')} aria-label="Activity type">
          <option value="">All activity</option>
          {families.map(f => <option key={f} value={`${f}.`}>{f}.*</option>)}
          {(actions.data || []).map(a => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
        </select>
        <select className="input" value={filters.level} onChange={set('level')} aria-label="Level">
          <option value="">All levels</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option>
        </select>
        {admin && (
          <select className="input" value={filters.user_id} onChange={set('user_id')} aria-label="User">
            <option value="">All users</option>
            {(users.data || []).map(u => <option key={u.user_id} value={u.user_id}>{u.username}</option>)}
          </select>
        )}
        <select className="input" value={filters.project_id} onChange={set('project_id')} aria-label="Project">
          <option value="">All projects</option>
          {(projects.data || []).map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
        </select>
        <label className="date-field">From <input className="input" type="date" value={filters.date_from} onChange={set('date_from')} /></label>
        <label className="date-field">To <input className="input" type="date" value={filters.date_to} onChange={set('date_to')} /></label>
        {Object.values(filters).some(Boolean) && <button className="btn btn-ghost btn-sm" onClick={() => setFilters(BLANK)}>Clear</button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data?.items.length === 0 ? <Empty icon="logs" title="No log entries match these filters" /> : (
        <>
          <div className="table-wrap card flush">
            <table className="table logs-table">
              <thead><tr><th>Time</th><th>Level</th><th>Action</th><th>Message</th><th>User</th><th>Project</th>{admin && <th>IP</th>}</tr></thead>
              <tbody>{data?.items.map(l => (
                <tr key={l.log_id}>
                  <td className="nowrap mono small">{dateTime(l.timestamp)}</td>
                  <td><Badge status={l.level} /></td>
                  <td className="mono small nowrap">{l.action}</td>
                  <td>{l.log_message}</td>
                  <td className="nowrap">{l.username || '—'}</td>
                  <td>{l.project_name || '—'}</td>
                  {admin && <td className="mono small">{l.ip_address || '—'}</td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{data.total.toLocaleString()} entries</span>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </>
      )}
    </>
  )
}
