import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, qs } from '../../api'
import { useAuth } from '../../auth'
import Icon from '../../components/Icon'
import { Avatar, Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useApi } from '../../components/ui'
import { ago } from '../../format'
import { useToast } from '../../toast'

const BLANK = { username: '', email: '', organisation: '', role: 'Developer', password: '', is_active: true }

function UserForm({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?.user_id)
  const [form, setForm] = useState(editing ? { ...initial, password: '' } : BLANK)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = { username: form.username.trim(), email: form.email.trim(), role: form.role,
                   organisation: form.organisation?.trim() || null }
    if (form.password) body.password = form.password
    if (editing) body.is_active = form.is_active
    try {
      const saved = editing
        ? await api(`/api/users/${initial.user_id}`, { method: 'PATCH', body })
        : await api('/api/users', { method: 'POST', body })
      onSaved(saved, editing)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Edit ${initial.username}` : 'Add user'} onClose={onClose}
           footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" form="user-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="user-form" onSubmit={save} className="form-grid">
        {error && <div className="alert alert-error span-2"><Icon name="warning" /><span>{error}</span></div>}
        <Field label="Full name" htmlFor="u-name"><input id="u-name" className="input" value={form.username} onChange={set('username')} required minLength={2} /></Field>
        <Field label="Email" htmlFor="u-email"><input id="u-email" className="input" type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Organisation" htmlFor="u-org"><input id="u-org" className="input" value={form.organisation || ''} onChange={set('organisation')} /></Field>
        <Field label="Role" htmlFor="u-role" hint="Admins manage users and approve projects. Developers run projects.">
          <select id="u-role" className="input" value={form.role} onChange={set('role')}>
            <option value="Developer">Model Developer</option>
            <option value="Admin">Admin</option>
          </select>
        </Field>
        <Field label={editing ? 'Reset password' : 'Temporary password'} htmlFor="u-pw"
               hint={editing ? 'Leave blank to keep the current password. Resetting signs the user out everywhere.' : 'At least 8 characters. Share it securely.'}>
          <input id="u-pw" className="input" type="text" value={form.password} onChange={set('password')}
                 minLength={8} required={!editing} autoComplete="new-password" />
        </Field>
        {editing && (
          <Field label="Account status">
            <label className="check"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Account enabled</label>
          </Field>
        )}
      </form>
    </Modal>
  )
}

export default function UsersRoles() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [role, setRole] = useState('')
  const [editing, setEditing] = useState(null)
  const { data, error, loading, reload } = useApi(`/api/users${qs({ q, role })}`)

  const act = async (u, action, label) => {
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return
        await api(`/api/users/${u.user_id}`, { method: 'DELETE' })
      } else if (action === 'toggle') {
        await api(`/api/users/${u.user_id}`, { method: 'PATCH', body: { is_active: !u.is_active } })
      } else {
        await api(`/api/users/${u.user_id}/${action}`, { method: 'POST' })
      }
      toast(label, 'success')
      reload(true)
    } catch (e) { toast(e.message, 'error') }
  }

  const locked = u => u.locked_until && new Date(u.locked_until) > new Date()

  return (
    <>
      <PageHeader title="Users and Roles" subtitle="Add team members, assign roles and manage account access."
                  actions={<button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Add user</button>} />
      <div className="toolbar">
        <input className="input toolbar-search" type="search" placeholder="Search name, email or organisation"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search users" />
        <select className="input w-auto" value={role} onChange={e => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option><option value="Admin">Admins</option><option value="Developer">Developers</option>
        </select>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data?.length === 0 ? <Empty icon="users" title="No users match" /> : (
        <div className="table-wrap card flush">
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Projects</th><th>Last sign-in</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {data?.map(u => (
                <tr key={u.user_id} className={u.is_active ? '' : 'dim'}>
                  <td><div className="user-cell"><Avatar name={u.username} />
                    <div><strong>{u.username}</strong>{u.user_id === me.user_id && <span className="muted"> (you)</span>}
                      <div className="muted small">{u.email}{u.organisation && ` · ${u.organisation}`}</div></div></div></td>
                  <td><Badge status={u.role}>{u.role === 'Developer' ? 'Model Developer' : 'Admin'}</Badge></td>
                  <td>{locked(u) ? <Badge status="Locked" /> : <Badge status={u.is_active ? 'Active' : 'Disabled'} />}
                    {u.failed_logins > 0 && <div className="muted small">{u.failed_logins} failed attempt(s)</div>}</td>
                  <td>{u.project_count}</td>
                  <td className="nowrap">{ago(u.last_login_at)}</td>
                  <td className="right nowrap">
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(u)}><Icon name="edit" /></button>
                    {locked(u) && <button className="icon-btn" title="Unlock" onClick={() => act(u, 'unlock', `${u.email} unlocked`)}><Icon name="key" /></button>}
                    {u.user_id !== me.user_id && <>
                      <button className="icon-btn" title="Sign out all sessions" onClick={() => act(u, 'revoke-sessions', `Sessions revoked for ${u.email}`)}><Icon name="logout" /></button>
                      <button className="icon-btn" title={u.is_active ? 'Disable account' : 'Enable account'}
                              onClick={() => act(u, 'toggle', `${u.email} ${u.is_active ? 'disabled' : 'enabled'}`)}><Icon name={u.is_active ? 'lock' : 'check'} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => act(u, 'delete', `${u.email} deleted`)}><Icon name="trash" /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <UserForm initial={editing} onClose={() => setEditing(null)}
                            onSaved={(u, wasEdit) => { setEditing(null); toast(wasEdit ? 'User updated' : `${u.email} added`, 'success'); reload(true) }} />}
    </>
  )
}
