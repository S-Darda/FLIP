import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { homeFor, useAuth } from '../../auth'
import Icon from '../../components/Icon'
import { AuthLayout, PasswordInput } from './SignIn'

export default function SignUp() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [form, setForm] = useState({ username: '', email: '', organisation_id: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/api/orgs/public').then(setOrgs).catch(() => {}) }, [])

  if (user) return <Navigate to={homeFor(user)} replace />
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError('')
    try {
      await register({ username: form.username.trim(), email: form.email.trim(), password: form.password,
                       organisation_id: form.organisation_id ? Number(form.organisation_id) : null })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <h1>Create a developer account</h1>
        <p className="muted">Design studies and train models across sites.</p>
        {error && <div className="alert alert-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
        <div className="input-icon"><Icon name="user" />
          <input value={form.username} onChange={set('username')} placeholder="Full name" autoComplete="name" required minLength={2} aria-label="Full name" />
        </div>
        <div className="input-icon"><Icon name="mail" />
          <input type="email" value={form.email} onChange={set('email')} placeholder="Work email" autoComplete="email" required aria-label="Email" />
        </div>
        <select className="input" value={form.organisation_id} onChange={set('organisation_id')} aria-label="Organisation" style={{ marginBottom: '.8rem' }}>
          <option value="">Organisation (optional)</option>
          {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
        </select>
        <PasswordInput value={form.password} onChange={set('password')} placeholder="Password (8+ characters)" autoComplete="new-password" />
        <PasswordInput value={form.confirm} onChange={set('confirm')} placeholder="Confirm password" autoComplete="new-password" />
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <div className="auth-switch">Already registered? <Link to="/signin">Sign in</Link></div>
      </form>
    </AuthLayout>
  )
}
