import { useCallback, useEffect, useRef, useState } from 'react'
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

export function Stat({ label, value, hint, icon, tone = 'c1' }) {
  return (
    <div className="stat">
      {icon && <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={20} /></span>}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
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

export function Progress({ value, max = 1, tone }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0
  return <div className="progress" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin="0" aria-valuemax="100">
    <span className={tone ? `tone-bg-${tone}` : ''} style={{ width: `${p}%` }} />
  </div>
}

export function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) % 360
  return <span className="avatar" style={{ width: size, height: size, background: `hsl(${h} 45% 45%)`, fontSize: size * 0.38 }}>{initials}</span>
}
