import { useState } from 'react'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Panel, Spinner, useApi } from '../../components/ui'
import { ago } from '../../format'
import { useToast } from '../../toast'

const SERVER = typeof window !== 'undefined' ? `${location.protocol}//${location.hostname}:8000` : 'http://localhost:8000'

/** One-time token dialog: the token is shown once and never again. */
function TokenDialog({ site, onClose }) {
  const toast = useToast()
  const copy = text => navigator.clipboard?.writeText(text).then(() => toast('Copied', 'success')).catch(() => {})
  const enrol = `python -m flip_agent --state .flip-agent enrol --server ${SERVER} --token ${site.enrolment_token}`
  return (
    <Modal title={`Enrol ${site.name}`} onClose={onClose} wide
           footer={<button className="btn btn-primary" onClick={onClose}>I've saved the token</button>}>
      <div className="alert alert-warning"><Icon name="warning" /><span>This token is shown once and expires in 24 hours. Send it to the site's operator over a trusted channel.</span></div>
      <div className="token-box" onClick={() => copy(site.enrolment_token)} title="Click to copy">{site.enrolment_token}</div>
      <p className="section-title" style={{ marginTop: '1rem' }}>At the site</p>
      <ol className="steps-inline">
        <li><span>Install the agent: <span className="mono">pip install -e flipml -e agent</span></span></li>
        <li><span>Enrol. The agent creates its own key pair; only the public key is sent.</span></li>
      </ol>
      <div className="code-box" onClick={() => copy(enrol)} title="Click to copy">{enrol}</div>
      <ol className="steps-inline" start={3} style={{ marginTop: '.8rem' }}>
        <li><span>Register a local CSV. Only its schema (columns, types, row count) is sent:</span></li>
      </ol>
      <div className="code-box">python -m flip_agent --state .flip-agent add-dataset --name readmissions --path ./readmissions.csv</div>
      <ol className="steps-inline" start={4} style={{ marginTop: '.8rem' }}>
        <li><span>Run: <span className="mono">python -m flip_agent --state .flip-agent run</span></span></li>
      </ol>
    </Modal>
  )
}

export default function Sites() {
  const toast = useToast()
  const sites = useApi('/api/sites')
  const orgs = useApi('/api/orgs')
  const [newSite, setNewSite] = useState({ name: '', org_id: '' })
  const [orgName, setOrgName] = useState('')
  const [token, setToken] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  const createSite = async e => {
    e.preventDefault()
    setError('')
    try {
      const s = await api('/api/sites', { method: 'POST', body: { name: newSite.name.trim(), org_id: Number(newSite.org_id) } })
      setToken(s)
      setNewSite({ name: '', org_id: newSite.org_id })
      sites.reload(true)
    } catch (err) { setError(err.message) }
  }
  const createOrg = async e => {
    e.preventDefault()
    try { await api('/api/orgs', { method: 'POST', body: { name: orgName.trim() } }); setOrgName(''); orgs.reload(true); toast('Organisation added', 'success') }
    catch (err) { toast(err.message, 'error') }
  }
  const act = async (s, path, msg) => {
    if (path === 'revoke' && !window.confirm(`Revoke ${s.name}? Its agent stops working immediately.`)) return
    try {
      const r = await api(`/api/sites/${s.site_id}/${path}`, { method: 'POST' })
      if (r.enrolment_token) setToken(r)
      else toast(msg, 'success')
      sites.reload(true)
    } catch (err) { toast(err.message, 'error') }
  }

  const sel = sites.data?.find(s => s.site_id === selected) || sites.data?.[0]

  return (
    <>
      <PageHeader title="Sites and Organisations"
                  subtitle="Data-owner sites run the FLIP agent. They enrol with a one-time token and register datasets by schema only." />
      <ErrorBox error={sites.error} onRetry={sites.reload} />
      <div className="fill grid-side">
        <div className="rows-2">
          <Panel title="Sites" subtitle={`${(sites.data || []).filter(s => s.status === 'Active').length} active`} flush>
            {sites.loading && !sites.data ? <Spinner /> : !sites.data?.length ? <Empty icon="globe" title="No sites yet">Register one on the right.</Empty> : (
              <table className="table">
                <thead><tr><th>Site</th><th>Organisation</th><th>Status</th><th>Datasets</th><th>Last seen</th><th className="right">Actions</th></tr></thead>
                <tbody>{sites.data.map(s => (
                  <tr key={s.site_id} onClick={() => setSelected(s.site_id)} style={{ cursor: 'pointer' }} className={sel?.site_id === s.site_id ? 'best' : ''}>
                    <td><strong>{s.name}</strong>{s.key_fingerprint && <div className="muted mono small">key {s.key_fingerprint}…</div>}</td>
                    <td>{s.organisation}</td>
                    <td><Badge status={s.status === 'Active' ? 'Active' : s.status === 'Revoked' ? 'Disabled' : 'Pending'}>{s.status}</Badge></td>
                    <td>{s.datasets.map(d => <span key={d.id} className="chip mono">{d.name} · {d.rows}</span>)}</td>
                    <td className="nowrap">{ago(s.last_seen)}</td>
                    <td className="right nowrap" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" onClick={() => act(s, 'token')}><Icon name="key" size={13} /> New token</button>
                      {s.status !== 'Revoked' && <button className="btn btn-sm btn-ghost danger" onClick={() => act(s, 'revoke', `${s.name} revoked`)}>Revoke</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
          <Panel title={sel ? `Dataset schemas at ${sel.name}` : 'Dataset schemas'} subtitle="metadata only: no rows are stored on this server">
            {!sel?.datasets.length ? <p className="muted">This site hasn't registered a dataset yet.</p> : sel.datasets.map(d => (
              <div key={d.id} style={{ marginBottom: '.8rem' }}>
                <strong className="mono">{d.name}</strong> <span className="muted small">· {d.rows} rows · updated {ago(d.updated_at)}</span>
                <table className="table" style={{ marginTop: '.4rem' }}>
                  <thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Distinct</th><th>Shareable categories</th></tr></thead>
                  <tbody>{d.schema.columns.map(c => (
                    <tr key={c.name}><td className="mono">{c.name}</td><td>{c.type}</td><td>{c.missing}</td><td>{c.distinct}</td>
                      <td className="small">{c.values ? c.values.join(', ') : <span className="muted">withheld</span>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </Panel>
        </div>
        <div className="rows-2">
          <Panel title="Register a site">
            <form onSubmit={createSite}>
              {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
              <Field label="Site name" htmlFor="s-name"><input id="s-name" className="input" value={newSite.name} onChange={e => setNewSite(n => ({ ...n, name: e.target.value }))} required minLength={2} placeholder="e.g. Riverside Hospital" /></Field>
              <Field label="Organisation" htmlFor="s-org">
                <select id="s-org" className="input" value={newSite.org_id} onChange={e => setNewSite(n => ({ ...n, org_id: e.target.value }))} required>
                  <option value="">Choose…</option>
                  {(orgs.data || []).map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
                </select>
              </Field>
              <button className="btn btn-primary" disabled={!newSite.name || !newSite.org_id}><Icon name="plus" size={14} /> Register and get token</button>
            </form>
          </Panel>
          <Panel title="Organisations" footer={
            <form onSubmit={createOrg} style={{ display: 'flex', gap: '.4rem', width: '100%' }}>
              <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="New organisation" aria-label="New organisation" />
              <button className="btn" disabled={orgName.trim().length < 2}>Add</button>
            </form>}>
            <ul className="list compact">
              {(orgs.data || []).map(o => <li key={o.org_id}><span>{o.name}</span><small className="muted">{o.users} users · {o.sites} sites</small></li>)}
            </ul>
          </Panel>
        </div>
      </div>
      {token && <TokenDialog site={token} onClose={() => setToken(null)} />}
    </>
  )
}
