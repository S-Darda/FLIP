import { api } from '../../api'
import { BarChart, HBars } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, PageHeader, Spinner, Stat, useApi } from '../../components/ui'
import { ago, dateTime } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

const shortDay = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Security() {
  const toast = useToast()
  const { data, error, loading, reload } = useApi('/api/security/overview')
  useRealtimeEvent('log', e => e.log.action.startsWith('auth.login_') && e.log.action !== 'auth.login' && reload(true))

  const act = async (u, path, label) => {
    try {
      if (path === 'disable') await api(`/api/users/${u.user_id}`, { method: 'PATCH', body: { is_active: false } })
      else await api(`/api/users/${u.user_id}/${path}`, { method: 'POST' })
      toast(label, 'success')
      reload(true)
    } catch (e) { toast(e.message, 'error') }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const failed14 = data.failed_logins.reduce((s, d) => s + d.count, 0)

  return (
    <>
      <PageHeader title="Security" subtitle="Failed sign-ins, locked accounts and session control. Accounts lock automatically after repeated failures." />
      <div className="stats">
        <Stat icon="warning" tone="c3" label="Failed sign-ins (14 days)" value={failed14} />
        <Stat icon="lock" tone="c6" label="Locked accounts" value={data.locked.length} />
        <Stat icon="x" tone="c5" label="Disabled accounts" value={data.disabled.length} />
      </div>
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Failed sign-ins per day</h2>
          <BarChart data={data.failed_logins.map(d => ({ label: shortDay(d.date), value: d.count }))} color="var(--red)" labelEvery={2} />
        </section>
        <section className="card">
          <h2 className="card-title">Top source addresses <small>last 7 days</small></h2>
          {data.failed_by_ip.length === 0 ? <p className="muted">No failed sign-ins.</p>
            : <HBars data={data.failed_by_ip.map(r => ({ label: r.ip, value: r.count, color: 'var(--red)' }))} />}
        </section>
      </div>
      <section className="card">
        <h2 className="card-title">Accounts needing attention</h2>
        {data.at_risk.length === 0 && data.locked.length === 0 ? <p className="muted">No accounts have recent failed attempts.</p> : (
          <table className="table">
            <thead><tr><th>Account</th><th>Failed attempts</th><th>State</th><th className="right">Actions</th></tr></thead>
            <tbody>{[...new Map([...data.locked, ...data.at_risk].map(u => [u.user_id, u])).values()].map(u => {
              const isLocked = u.locked_until && new Date(u.locked_until) > new Date()
              return (
                <tr key={u.user_id}>
                  <td><strong>{u.username}</strong><div className="muted small">{u.email} · {u.role}</div></td>
                  <td>{u.failed_logins}</td>
                  <td>{isLocked ? <Badge status="Locked">Locked until {dateTime(u.locked_until)}</Badge> : <Badge status={u.is_active ? 'Active' : 'Disabled'} />}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm btn-ghost" onClick={() => act(u, 'unlock', `${u.email} unlocked and counter reset`)}><Icon name="key" size={14} /> Reset</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => act(u, 'revoke-sessions', `All sessions for ${u.email} revoked`)}><Icon name="logout" size={14} /> Revoke sessions</button>
                    {u.is_active && <button className="btn btn-sm btn-ghost danger" onClick={() => act(u, 'disable', `${u.email} disabled`)}><Icon name="lock" size={14} /> Disable</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2 className="card-title">Recent security events</h2>
        <table className="table">
          <thead><tr><th>When</th><th>Event</th><th>Detail</th><th>IP</th></tr></thead>
          <tbody>{data.events.map(l => (
            <tr key={l.log_id}><td className="nowrap">{ago(l.timestamp)}</td><td><Badge status={l.level}>{l.action}</Badge></td>
              <td>{l.log_message}</td><td className="mono">{l.ip_address || '—'}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </>
  )
}
