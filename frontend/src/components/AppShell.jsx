import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { ago } from '../format'
import { useRealtime, useRealtimeEvent } from '../realtime'
import { useToast } from '../toast'
import Icon from './Icon'
import Logo from './Logo'
import { Avatar } from './ui'

const NAV = {
  admin: [
    { to: '/admin', icon: 'dashboard', label: 'Dashboard', end: true },
    { to: '/admin/projects', icon: 'project', label: 'Manage Projects' },
    { to: '/admin/users', icon: 'users', label: 'Users and Roles' },
    { to: '/admin/logs', icon: 'logs', label: 'Monitoring and Logging' },
    { to: '/admin/training', icon: 'nodes', label: 'Federated Training Control' },
    { to: '/admin/models', icon: 'model', label: 'Model Approvals' },
    { to: '/admin/security', icon: 'shield', label: 'Security' },
    { to: '/admin/live', icon: 'live', label: 'Real-Time Updates' },
  ],
  dev: [
    { to: '/app', icon: 'dashboard', label: 'Dashboard', end: true },
    { to: '/app/apply', icon: 'plus', label: 'Apply for Approval' },
    { to: '/app/projects', icon: 'project', label: 'Your Projects' },
    { to: '/app/training', icon: 'nodes', label: 'Training Runs' },
    { to: '/app/models', icon: 'model', label: 'Model Submissions' },
    { to: '/app/logs', icon: 'logs', label: 'Activity Logs' },
    { to: '/app/live', icon: 'live', label: 'Real-Time Updates' },
  ],
}

function NotificationBell({ base }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unread: 0, items: [] })
  const ref = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()

  const load = () => api('/api/notifications').then(setData).catch(() => {})
  useEffect(() => { load() }, [])
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
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
        {data.unread > 0 && <span className="bell-dot">{data.unread > 9 ? '9+' : data.unread}</span>}
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

function GlobalSearch({ base }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const navigate = useNavigate()
  const ref = useRef(null)
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined }
    const t = setTimeout(() => api(`/api/search?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setRes(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const pick = to => { setQ(''); setRes(null); navigate(to) }
  const hasResults = res && (res.projects.length || res.users?.length)
  return (
    <div className="search" ref={ref}>
      <Icon name="search" />
      <input type="search" placeholder={base === '/admin' ? 'Search projects and users…' : 'Search your projects…'}
             value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      {res && (
        <div className="dropdown search-menu">
          {!hasResults && <div className="dropdown-empty">No matches for “{q}”.</div>}
          {res.projects.map(p => (
            <button key={`p${p.project_id}`} className="bell-item" onClick={() => pick(`${base}/projects/${p.project_id}`)}>
              <span><Icon name="project" size={14} /> {p.project_name}</span><small>{p.status}</small>
            </button>
          ))}
          {res.users?.map(u => (
            <button key={`u${u.user_id}`} className="bell-item" onClick={() => pick(`/admin/users?q=${encodeURIComponent(u.email)}`)}>
              <span><Icon name="user" size={14} /> {u.username}</span><small>{u.email}</small>
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
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
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

export default function AppShell({ variant }) {
  const base = variant === 'admin' ? '/admin' : '/app'
  const { connected } = useRealtime()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setNavOpen(false), [location.pathname])
  const current = NAV[variant].filter(n => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <div className={`shell shell-${variant} ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo to={base} size={44} />
          <span className="sidebar-role">{variant === 'admin' ? 'Admin console' : 'Developer portal'}</span>
        </div>
        <nav aria-label="Main">
          {NAV[variant].map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} /> <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`ws-status ${connected ? 'on' : ''}`} title="Real-time connection">
          <span className="dot" /> {connected ? 'Live updates on' : 'Reconnecting…'}
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(o => !o)} aria-label="Menu"><Icon name="menu" /></button>
          <div className="topbar-title">{current?.label || 'FLIP'}</div>
          <GlobalSearch base={base} />
          <NotificationBell base={base} />
          <UserMenu base={base} />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
