import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import Icon from '../components/Icon'
import { Field, PageHeader, Panel } from '../components/ui'
import { dateTime } from '../format'
import { useToast } from '../toast'

function TwoFactor() {
  const { user, setUser, applySession } = useAuth()
  const toast = useToast()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const start = async () => {
    setError('')
    try { setSetup(await api('/api/auth/mfa/setup', { method: 'POST' })) } catch (e) { setError(e.message) }
  }
  const enable = async e => {
    e.preventDefault()
    setError('')
    try {
      applySession(await api('/api/auth/mfa/enable', { method: 'POST', body: { code } }))
      setSetup(null)
      setCode('')
      toast('Two-factor authentication is on. Other sessions were signed out.', 'success')
    } catch (err) { setError(err.message) }
  }
  const disable = async e => {
    e.preventDefault()
    setError('')
    try {
      setUser(await api('/api/auth/mfa/disable', { method: 'POST', body: { code, password } }))
      setCode('')
      setPassword('')
      toast('Two-factor authentication turned off', 'warning')
    } catch (err) { setError(err.message) }
  }

  return (
    <Panel title="Two-factor authentication" subtitle={user.mfa_enabled ? 'on' : 'off'}>
      {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
      {user.mfa_enabled ? (
        <form onSubmit={disable}>
          <div className="alert alert-success"><Icon name="check" /><span>Sign-in needs a code from your authenticator app.</span></div>
          <Field label="Current code" htmlFor="m-code"><input id="m-code" className="input otp-input" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Password" htmlFor="m-pw"><input id="m-pw" type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          <button className="btn btn-danger" disabled={code.length !== 6 || !password}>Turn off</button>
        </form>
      ) : setup ? (
        <form onSubmit={enable}>
          <ol className="steps-inline">
            <li><span>In an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), add an account with this key:</span></li>
          </ol>
          <div className="token-box">{setup.secret.match(/.{1,4}/g).join(' ')}</div>
          <p className="field-hint">Or paste this URI into apps that accept one: <span className="mono small">{setup.otpauth_uri}</span></p>
          <ol className="steps-inline" start={2}><li><span>Enter the 6-digit code it shows:</span></li></ol>
          <input className="input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code" />
          <div className="btn-row" style={{ marginTop: '.7rem' }}>
            <button className="btn btn-primary" disabled={code.length !== 6}>Turn on</button>
            <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">Protect your account with a time-based one-time code (TOTP) in addition to your password.
            {user.role === 'Admin' && ' Strongly recommended for admin accounts.'}</p>
          <button className="btn btn-primary" onClick={start}><Icon name="shield" size={14} /> Set up two-factor</button>
        </>
      )}
    </Panel>
  )
}

export default function Account() {
  const { user, setUser, applySession } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.username)
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwError, setPwError] = useState('')

  const saveProfile = async e => {
    e.preventDefault()
    try { setUser(await api('/api/auth/me', { method: 'PATCH', body: { username: name.trim() } })); toast('Profile saved', 'success') }
    catch (err) { toast(err.message, 'error') }
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
      <PageHeader title="Account" subtitle={`${user.email} · ${user.role}${user.organisation ? ` · ${user.organisation}` : ''} · member since ${dateTime(user.created_at)}`} />
      <div className="fill grid-3">
        <Panel title="Profile">
          <form onSubmit={saveProfile}>
            <Field label="Full name" htmlFor="a-name"><input id="a-name" className="input" value={name} onChange={e => setName(e.target.value)} required minLength={2} /></Field>
            <Field label="Email" hint="Ask an admin to change your email."><input className="input" value={user.email} readOnly /></Field>
            <Field label="Organisation" hint="Set by an admin."><input className="input" value={user.organisation || '—'} readOnly /></Field>
            <button className="btn btn-primary">Save profile</button>
          </form>
        </Panel>
        <Panel title="Password">
          <form onSubmit={changePassword}>
            {pwError && <div className="alert alert-error"><Icon name="warning" /><span>{pwError}</span></div>}
            <Field label="Current password" htmlFor="a-cur"><input id="a-cur" className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} required /></Field>
            <Field label="New password" htmlFor="a-new" hint="At least 8 characters."><input id="a-new" className="input" type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} required /></Field>
            <Field label="Confirm new password" htmlFor="a-conf"><input id="a-conf" className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} required /></Field>
            <button className="btn btn-primary">Change password</button>
          </form>
        </Panel>
        <TwoFactor />
      </div>
    </>
  )
}
