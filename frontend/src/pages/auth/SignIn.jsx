import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../../auth'
import Icon from '../../components/Icon'
import { ThemeToggle } from '../../components/AppShell'
import Logo from '../../components/Logo'
import { Aurora } from '../../components/ui'

export function PasswordInput({ id, value, onChange, placeholder, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-icon">
      <Icon name="lock" />
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
             autoComplete={autoComplete} required />
      <button type="button" className="input-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}

export default function SignIn({ portal }) {
  const admin = portal === 'admin'
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  if (user) return <Navigate to={homeFor(user)} replace />

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const u = await login(email.trim(), password, portal)
      const from = location.state?.from
      navigate(from && from.startsWith(homeFor(u)) ? from : homeFor(u), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`auth-page ${admin ? 'auth-admin' : ''}`}>
      <Aurora />
      <ThemeToggle className="auth-theme" />
      <div className="auth-brand"><Logo /></div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>{admin ? 'Admin Sign In' : 'Model Developer Sign In'}</h1>
        <p className="muted center">{admin ? 'Restricted to platform administrators.' : 'Manage your federated learning projects.'}</p>
        {error && <div className="alert alert-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
        <label className="sr-only" htmlFor="email">Email</label>
        <div className="input-icon">
          <Icon name="mail" />
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                 placeholder={admin ? 'Admin email' : 'Email address'} autoComplete="username" required autoFocus />
        </div>
        <label className="sr-only" htmlFor="password">Password</label>
        <PasswordInput id="password" value={password} onChange={e => setPassword(e.target.value)}
                       placeholder={admin ? 'Admin password' : 'Password'} />
        <button className="btn btn-gradient btn-block btn-lg" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <button type="button" className="link-btn" onClick={() => setForgot(f => !f)}>Forgot password?</button>
        {forgot && (
          <p className="field-hint center">
            For security, passwords are reset by an administrator. Ask your FLIP admin to reset it from Users and Roles.
          </p>
        )}
        <div className="auth-switch">
          {admin
            ? <>Model developer? <Link to="/signin">Use the developer sign-in</Link></>
            : <>New to FLIP? <Link to="/signup">Create an account</Link> · <Link to="/admin/signin">Admin sign-in</Link></>}
        </div>
        {import.meta.env.DEV && (
          <details className="demo-hint">
            <summary>Demo accounts (development only)</summary>
            <p>See the README for the seeded admin and developer logins.</p>
          </details>
        )}
      </form>
    </div>
  )
}
