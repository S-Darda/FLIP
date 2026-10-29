import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../../auth'
import Icon from '../../components/Icon'
import Logo from '../../components/Logo'
import { PasswordInput } from './SignIn'

export default function SignUp() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', organisation: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
                       organisation: form.organisation.trim() || null })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand"><Logo /></div>
      <form className="auth-card" onSubmit={submit}>
        <h1>Create a developer account</h1>
        <p className="muted center">Submit federated learning projects and train models across institutions.</p>
        {error && <div className="alert alert-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
        <div className="input-icon"><Icon name="user" />
          <input value={form.username} onChange={set('username')} placeholder="Full name" autoComplete="name" required minLength={2} aria-label="Full name" />
        </div>
        <div className="input-icon"><Icon name="mail" />
          <input type="email" value={form.email} onChange={set('email')} placeholder="Work email" autoComplete="email" required aria-label="Email" />
        </div>
        <div className="input-icon"><Icon name="globe" />
          <input value={form.organisation} onChange={set('organisation')} placeholder="Organisation (optional)" autoComplete="organization" aria-label="Organisation" />
        </div>
        <PasswordInput value={form.password} onChange={set('password')} placeholder="Password (8+ characters)" autoComplete="new-password" />
        <PasswordInput value={form.confirm} onChange={set('confirm')} placeholder="Confirm password" autoComplete="new-password" />
        <button className="btn btn-gradient btn-block btn-lg" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <div className="auth-switch">Already registered? <Link to="/signin">Sign in</Link></div>
      </form>
    </div>
  )
}
