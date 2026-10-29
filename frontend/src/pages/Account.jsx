import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import Icon from '../components/Icon'
import { Field, PageHeader } from '../components/ui'
import { dateTime } from '../format'
import { useToast } from '../toast'

export default function Account() {
  const { user, setUser, applySession } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState({ username: user.username, organisation: user.organisation || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwError, setPwError] = useState('')

  const saveProfile = async e => {
    e.preventDefault()
    try {
      setUser(await api('/api/auth/me', { method: 'PATCH', body: { username: profile.username.trim(), organisation: profile.organisation.trim() || null } }))
      toast('Profile saved', 'success')
    } catch (err) { toast(err.message, 'error') }
  }

  const changePassword = async e => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return setPwError('New passwords do not match.')
    setPwError('')
    try {
      applySession(await api('/api/auth/change-password', { method: 'POST', body: { current_password: pw.current_password, new_password: pw.new_password } }))
      setPw({ current_password: '', new_password: '', confirm: '' })
      toast('Password changed. Other sessions have been signed out.', 'success')
    } catch (err) { setPwError(err.message) }
  }

  return (
    <>
      <PageHeader title="Account" subtitle={`${user.email} · ${user.role} · member since ${dateTime(user.created_at)}`} />
      <div className="grid-2">
        <form className="card" onSubmit={saveProfile}>
          <h2 className="card-title">Profile</h2>
          <Field label="Full name" htmlFor="a-name"><input id="a-name" className="input" value={profile.username} onChange={e => setProfile(p => ({ ...p, username: e.target.value }))} required minLength={2} /></Field>
          <Field label="Organisation" htmlFor="a-org"><input id="a-org" className="input" value={profile.organisation} onChange={e => setProfile(p => ({ ...p, organisation: e.target.value }))} /></Field>
          <Field label="Email" hint="Ask an admin to change your email."><input className="input" value={user.email} readOnly /></Field>
          <button className="btn btn-primary">Save profile</button>
        </form>
        <form className="card" onSubmit={changePassword}>
          <h2 className="card-title">Change password</h2>
          {pwError && <div className="alert alert-error"><Icon name="warning" /><span>{pwError}</span></div>}
          <Field label="Current password" htmlFor="a-cur"><input id="a-cur" className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} required /></Field>
          <Field label="New password" htmlFor="a-new" hint="At least 8 characters."><input id="a-new" className="input" type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} required /></Field>
          <Field label="Confirm new password" htmlFor="a-conf"><input id="a-conf" className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} required /></Field>
          <button className="btn btn-primary">Change password</button>
        </form>
      </div>
    </>
  )
}
