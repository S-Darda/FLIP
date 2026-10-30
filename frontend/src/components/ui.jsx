import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

/** Fetch `path` on mount (and whenever deps change). Returns { data, error, loading, reload, setData }. */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const ctrl = useRef(null)
  const load = useCallback(async (quiet = false) => {
    if (!path) { setLoading(false); return }
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    if (!quiet) setLoading(true)
    try {
      setData(await api(path, { signal: c.signal }))
      setError(null)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      if (!c.signal.aborted) setLoading(false)
    }
  }, [path])
  useEffect(() => { load(); return () => ctrl.current?.abort() }, [load, ...deps])
  return { data, error, loading, reload: load, setData }
}

const STATUS_CLASS = {
  Pending: 'amber', 'In Review': 'blue', Approved: 'green', Rejected: 'red',
  Queued: 'gray', 'In Progress': 'blue', Completed: 'green', Failed: 'red', Cancelled: 'gray',
  Admin: 'purple', Developer: 'teal', info: 'gray', warning: 'amber', error: 'red',
  Active: 'green', Disabled: 'red', Locked: 'amber',
}

export function Badge({ status, children }) {
  const label = children ?? status
  return (
    <span className={`badge badge-${STATUS_CLASS[status] || 'gray'}`}>
      {status === 'In Progress' && <span className="pulse" />}
      {label}
    </span>
  )
}

export function Spinner({ label = 'Loading' }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}…</span></div>
}

/** Placeholder blocks shown while a page loads. */
export function Skeleton({ rows = 3 }) {
  return (
    <div aria-hidden="true">
      <div className="stats">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 86 }} />)}</div>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 200, marginBottom: 20 }} />)}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="warning" />
      <span>{error}</span>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={() => onRetry()}>Retry</button>}
    </div>
  )
}

export function Empty({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/** Animates the first number inside `value` (e.g. "82.0%", 14, "3/4") from 0 up to its final value. */
export function CountUp({ value, duration = 900 }) {
  const text = String(value ?? '')
  const m = text.match(/-?\d[\d,]*\.?\d*/)
  const target = m ? parseFloat(m[0].replace(/,/g, '')) : null
  const decimals = m && m[0].includes('.') ? m[0].split('.')[1].length : 0
  const [shown, setShown] = useState(target)
  const from = useRef(0)
  useEffect(() => {
    if (target === null) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(target); return undefined }
    const start = performance.now()
    const begin = from.current
    let raf
    const tick = now => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setShown(begin + (target - begin) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  if (target === null) return text
  // `shown` lags one render behind when the value first becomes numeric (e.g. "—" -> "0.85").
  const current = typeof shown === 'number' && Number.isFinite(shown) ? shown : target
  const formatted = m[0].includes(',') ? current.toLocaleString(undefined, { maximumFractionDigits: decimals }) : current.toFixed(decimals)
  return text.replace(m[0], formatted)
}

/** Keeps a crash in one page from blanking the whole app. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="alert alert-error" role="alert">
        <Icon name="warning" />
        <span>This page hit an error: {String(this.state.error.message || this.state.error)}</span>
        <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    )
  }
}

export function Aurora() {
  return <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
}

export function Stat({ label, value, hint, icon, tone = 'c1' }) {
  return (
    <div className="stat">
      {icon && <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={20} /></span>}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{typeof value === 'string' || typeof value === 'number' ? <CountUp value={value} /> : value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('input, textarea, select, button')?.focus()
    const onKey = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** A card with a fixed header and a body that scrolls on its own, so pages can fit one screen. */
export function Panel({ title, subtitle, actions, children, footer, flush, className = '', bodyRef }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {subtitle && <small>{subtitle}</small>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`} ref={bodyRef}>{children}</div>
      {footer && <div className="panel-foot">{footer}</div>}
    </section>
  )
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-head">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.value} role="tab" aria-selected={value === t.value}
                className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, max = 1, tone, live }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0
  return <div className={`progress ${live ? 'live' : ''}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin="0" aria-valuemax="100">
    <span className={tone ? `tone-bg-${tone}` : ''} style={{ width: `${p}%` }} />
  </div>
}

export function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) % 360
  return <span className="avatar" style={{ width: size, height: size, background: `hsl(${h} 45% 45%)`, fontSize: size * 0.38 }}>{initials}</span>
}
