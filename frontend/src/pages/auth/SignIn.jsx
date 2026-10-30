import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../../auth'
import { ThemeToggle } from '../../components/AppShell'
import Icon from '../../components/Icon'
import Logo from '../../components/Logo'

export function PasswordInput({ id, value, onChange, placeholder, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-icon">
      <Icon name="lock" />
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
             autoComplete={autoComplete} required aria-label={placeholder} />
      <button type="button" className="input-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}

export function AuthLayout({ children, admin }) {
  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Logo />
        <div>
          <h2>{admin ? 'Govern the federation.' : 'Train together, keep data local.'}</h2>
          <ul>
            {admin ? <>
              <li>Approve studies and deployment requests</li>
              <li>Enrol data-owner sites with one-time tokens</li>
              <li>Audit every action, revoke sessions, enforce MFA</li>
            </> : <>
              <li>Design a study: target, features, sites and privacy budget</li>
              <li>Site agents train locally; only updates and aggregates move</li>
              <li>Watch rounds live and export a signed, formatted PDF report</li>
            </>}
          </ul>
        </div>
        <small style={{ opacity: .6 }}>Research prototype · not for real personal or sensitive data</small>
      </aside>
      <div className="auth-main">
        <ThemeToggle className="auth-theme" />
        {children}
      </div>
    </div>
  )
}

export default function SignIn({ portal }) {
  const admin = portal === 'admin'
  const { user, login, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  if (user) return <Navigate to={homeFor(user)} replace />

  const done = u => {
    const from = location.state?.from
    navigate(from && from.startsWith(homeFor(u)) ? from : homeFor(u), { replace: true })
  }

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mfaToken) {
        done(await verifyMfa(mfaToken, code))
      } else {
        const res = await login(email.trim(), password, portal)
        if (res.mfa_token) setMfaToken(res.mfa_token)
        else done(res)
      }
    } catch (err) {
      setError(err.message)
      if (mfaToken && /expired/i.test(err.message)) setMfaToken(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout admin={admin}>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>{mfaToken ? 'Two-factor check' : admin ? 'Admin sign in' : 'Model developer sign in'}</h1>
        <p className="muted">{mfaToken ? 'Enter the 6-digit code from your authenticator app.'
          : admin ? 'Restricted to platform administrators.' : 'Manage your federated learning studies.'}</p>
        {error && <div className="alert alert-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
        {mfaToken ? (
          <input className="input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                 value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Authentication code" style={{ marginBottom: '.8rem' }} />
        ) : (
          <>
            <div className="input-icon">
              <Icon name="mail" />
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email"
                     placeholder={admin ? 'Admin email' : 'Email address'} autoComplete="username" required autoFocus />
            </div>
            <PasswordInput id="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          </>
        )}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy || (mfaToken ? code.length !== 6 : !email || !password)}>
          {busy ? 'Checking…' : mfaToken ? 'Verify and sign in' : 'Sign in'}
        </button>
        {mfaToken ? (
          <button type="button" className="link-btn" onClick={() => { setMfaToken(null); setCode('') }}>Use a different account</button>
        ) : (
          <button type="button" className="link-btn" onClick={() => setForgot(f => !f)}>Forgot password?</button>
        )}
        {forgot && !mfaToken && <p className="field-hint center">Passwords are reset by an administrator from Users and Roles.</p>}
        <div className="auth-switch">
          {admin
            ? <>Model developer? <Link to="/signin">Developer sign-in</Link></>
            : <>New to FLIP? <Link to="/signup">Create an account</Link> · <Link to="/admin/signin">Admin sign-in</Link></>}
        </div>
        {import.meta.env.DEV && <p className="demo-hint center">Demo accounts are listed in the README.</p>}
      </form>
    </AuthLayout>
  )
}
