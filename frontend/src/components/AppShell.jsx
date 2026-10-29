import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ago } from '../format'
import { useRealtime, useRealtimeEvent } from '../realtime'
import { useTheme } from '../theme'
import { useToast } from '../toast'
import CommandPalette from './CommandPalette'
import Icon from './Icon'
import Logo from './Logo'
import { Aurora, Avatar } from './ui'

const NAV = {
  admin: [
    { section: 'Overview' },
    { to: '/admin', icon: 'dashboard', label: 'Dashboard', end: true },
    { to: '/admin/live', icon: 'live', label: 'Real-Time Updates' },
    { section: 'Governance' },
    { to: '/admin/projects', icon: 'project', label: 'Manage Projects' },
    { to: '/admin/models', icon: 'model', label: 'Model Approvals' },
    { to: '/admin/users', icon: 'users', label: 'Users and Roles' },
    { section: 'Training' },
    { to: '/admin/training', icon: 'nodes', label: 'Federated Training Control' },
    { to: '/admin/compare', icon: 'trophy', label: 'Compare and Leaderboard' },
    { section: 'Operations' },
    { to: '/admin/logs', icon: 'logs', label: 'Monitoring and Logging' },
    { to: '/admin/security', icon: 'shield', label: 'Security' },
  ],
  dev: [
    { section: 'Overview' },
    { to: '/app', icon: 'dashboard', label: 'Dashboard', end: true },
    { to: '/app/live', icon: 'live', label: 'Real-Time Updates' },
    { section: 'Projects' },
    { to: '/app/apply', icon: 'plus', label: 'Apply for Approval' },
    { to: '/app/projects', icon: 'project', label: 'Your Projects' },
    { section: 'Training' },
    { to: '/app/training', icon: 'nodes', label: 'Training Runs' },
    { to: '/app/compare', icon: 'trophy', label: 'Compare and Leaderboard' },
    { to: '/app/models', icon: 'model', label: 'Model Submissions' },
    { section: 'Audit' },
    { to: '/app/logs', icon: 'logs', label: 'Activity Logs' },
  ],
}

function useOutside(ref, onOut) {
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && onOut()
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ref, onOut])
}

function NotificationBell({ base }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unread: 0, items: [] })
  const ref = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()
  useOutside(ref, () => setOpen(false))

  useEffect(() => { api('/api/notifications').then(setData).catch(() => {}) }, [])
  useRealtimeEvent('notification', e => {
    setData(d => ({ unread: d.unread + 1, items: [e.notification, ...d.items].slice(0, 30) }))
    toast(e.notification.message, e.kind === 'error' ? 'error' : e.kind === 'warning' ? 'warning' : 'success')
  })

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && data.unread) {
      await api('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
      setData(d => ({ ...d, unread: 0 }))
    }
  }
  const go = n => {
    setOpen(false)
    if (!n.link) return
    // Links are written for the developer portal; admins open the same item in admin views.
    navigate(base === '/admin' ? n.link.replace(/^\/app\/projects/, '/admin/projects').replace(/^\/app\/training/, '/admin/training') : n.link)
  }

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={toggle} aria-label={`Notifications (${data.unread} unread)`} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {data.unread > 0 && <span key={data.unread} className="bell-dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown bell-menu">
          <div className="dropdown-head">Notifications</div>
          {data.items.length === 0 && <div className="dropdown-empty">You're all caught up.</div>}
          {data.items.map(n => (
            <button key={n.id} className={`bell-item ${n.is_read ? '' : 'unread'}`} onClick={() => go(n)}>
              <span>{n.message}</span>
              <small>{ago(n.created_at)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMenu({ base }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useOutside(ref, () => setOpen(false))
  const signOut = async () => {
    await logout()
    navigate(base === '/admin' ? '/admin/signin' : '/signin')
  }
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Avatar name={user.username} size={30} />
        <span className="user-name">{user.username}</span>
        <Icon name="chevron" size={14} className="rot90" />
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">{user.email}<br /><small>{user.role}{user.organisation ? ` · ${user.organisation}` : ''}</small></div>
          <Link className="bell-item" to={`${base}/account`} onClick={() => setOpen(false)}><span><Icon name="key" size={14} /> Account and password</span></Link>
          <button className="bell-item" onClick={signOut}><span><Icon name="logout" size={14} /> Sign out</span></button>
        </div>
      )}
    </div>
  )
}

export function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button className={`icon-btn theme-btn ${className}`} onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={19} />
    </button>
  )
}

export default function AppShell({ variant }) {
  const base = variant === 'admin' ? '/admin' : '/app'
  const { connected } = useRealtime()
  const [navOpen, setNavOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const location = useLocation()
  const links = NAV[variant].filter(n => n.to)

  useEffect(() => setNavOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const current = links.filter(n => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <div className={`shell shell-${variant} ${navOpen ? 'nav-open' : ''}`}>
      <Aurora />
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo to={base} size={40} label={false} />
          <div>
            <div className="logo-text" style={{ color: '#fff' }}>FLIP</div>
            <span className="sidebar-role">{variant === 'admin' ? 'Admin console' : 'Developer portal'}</span>
          </div>
        </div>
        <nav aria-label="Main">
          {NAV[variant].map((n, i) => n.section
            ? <div key={`s${i}`} className="nav-section">{n.section}</div>
            : (
              <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
                <Icon name={n.icon} /> <span>{n.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className={`ws-status ${connected ? 'on' : ''}`} title="Real-time connection">
          <span className="dot" /> {connected ? 'Live updates connected' : 'Reconnecting…'}
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(o => !o)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="topbar-title">
            <small>{variant === 'admin' ? 'Admin console' : 'Developer portal'}</small>
            {current?.label || 'FLIP'}
          </div>
          <button className="cmdk-trigger" onClick={() => setPalette(true)} aria-label="Open command palette">
            <Icon name="search" size={16} /><span>Search or jump to…</span><kbd>Ctrl K</kbd>
          </button>
          <ThemeToggle />
          <NotificationBell base={base} />
          <UserMenu base={base} />
        </header>
        <main className="content">
          <div key={location.pathname} className="page">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} nav={links} base={base} />
    </div>
  )
}
