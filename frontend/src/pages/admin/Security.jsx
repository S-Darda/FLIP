import { api } from '../../api'
import { BarChart, HBars } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, PageHeader, Panel, Spinner, Stat, useApi } from '../../components/ui'
import { ago, dateTime } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

const shortDay = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Security() {
  const toast = useToast()
  const { data, error, loading, reload } = useApi('/api/security/overview')
  const users = useApi('/api/users?role=Admin')
  useRealtimeEvent('log', e => e.log.action.startsWith('auth.login_') && reload(true))

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
  const admins = users.data || []
  const attention = [...new Map([...data.locked, ...data.at_risk].map(u => [u.user_id, u])).values()]

  return (
    <>
      <PageHeader title="Security" subtitle="Failed sign-ins, locked accounts, two-factor coverage and session control." />
      <div className="stats">
        <Stat icon="warning" tone="c3" label="Failed sign-ins (14 days)" value={failed14} />
        <Stat icon="lock" tone="c6" label="Locked accounts" value={data.locked.length} />
        <Stat icon="x" tone="c5" label="Disabled accounts" value={data.disabled.length} />
        <Stat icon="shield" tone="c1" label="Admins with 2FA" value={`${admins.filter(a => a.mfa_enabled).length}/${admins.length}`} />
      </div>
      <div className="fill grid-2">
        <div className="rows-2">
          <Panel title="Failed sign-ins per day">
            <BarChart height={140} data={data.failed_logins.map(d => ({ label: shortDay(d.date), value: d.count }))} color="var(--danger)" />
          </Panel>
          <Panel title="Top source addresses" subtitle="last 7 days">
            {data.failed_by_ip.length === 0 ? <p className="muted">No failed sign-ins.</p>
              : <HBars data={data.failed_by_ip.map(r => ({ label: r.ip, value: r.count, color: 'var(--danger)' }))} />}
          </Panel>
        </div>
        <div className="rows-2">
          <Panel title="Accounts needing attention" flush>
            {attention.length === 0 ? <p className="muted" style={{ padding: '.8rem .9rem' }}>No accounts have recent failed attempts.</p> : (
              <table className="table">
                <thead><tr><th>Account</th><th>Failures</th><th>State</th><th className="right">Actions</th></tr></thead>
                <tbody>{attention.map(u => {
                  const locked = u.locked_until && new Date(u.locked_until) > new Date()
                  return (
                    <tr key={u.user_id}>
                      <td><strong>{u.username}</strong><div className="muted small">{u.email}</div></td>
                      <td>{u.failed_logins}</td>
                      <td>{locked ? <Badge status="Locked">until {dateTime(u.locked_until)}</Badge> : <Badge status={u.is_active ? 'Active' : 'Disabled'} />}</td>
                      <td className="right nowrap">
                        <button className="icon-btn" title="Reset counter" onClick={() => act(u, 'unlock', `${u.email} unlocked`)}><Icon name="key" size={15} /></button>
                        <button className="icon-btn" title="Revoke sessions" onClick={() => act(u, 'revoke-sessions', `Sessions revoked for ${u.email}`)}><Icon name="logout" size={15} /></button>
                        {u.is_active && <button className="icon-btn danger" title="Disable" onClick={() => act(u, 'disable', `${u.email} disabled`)}><Icon name="lock" size={15} /></button>}
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </Panel>
          <Panel title="Recent security events" flush>
            <table className="table">
              <thead><tr><th>When</th><th>Event</th><th>Detail</th><th>IP</th></tr></thead>
              <tbody>{data.events.map(l => (
                <tr key={l.log_id}><td className="nowrap">{ago(l.timestamp)}</td><td><Badge status={l.level}>{l.action}</Badge></td>
                  <td>{l.log_message}</td><td className="mono">{l.ip_address || '—'}</td></tr>
              ))}</tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  )
}
