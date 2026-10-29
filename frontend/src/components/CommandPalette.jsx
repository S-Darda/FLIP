import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import Icon from './Icon'

/** Ctrl/Cmd+K launcher: jump to any page, search projects and users, run quick actions. */
export default function CommandPalette({ open, onClose, nav, base }) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { resolved, toggle } = useTheme()
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState(null)
  const [sel, setSel] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { if (open) { setQ(''); setRemote(null); setSel(0) } }, [open])
  useEffect(() => {
    if (!open || q.trim().length < 2) { setRemote(null); return undefined }
    const t = setTimeout(() => api(`/api/search?q=${encodeURIComponent(q.trim())}`).then(setRemote).catch(() => {}), 160)
    return () => clearTimeout(t)
  }, [q, open])

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    const match = s => !term || s.toLowerCase().includes(term)
    const out = []
    nav.filter(n => match(n.label)).forEach(n => out.push({ group: 'Go to', icon: n.icon, label: n.label, run: () => navigate(n.to) }))
    const actions = [
      base === '/app' && { icon: 'plus', label: 'New project', run: () => navigate('/app/apply') },
      { icon: resolved === 'dark' ? 'sun' : 'moon', label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`, run: toggle },
      { icon: 'key', label: 'Account and password', run: () => navigate(`${base}/account`) },
      { icon: 'globe', label: 'Open the public home page', run: () => navigate('/') },
      { icon: 'logout', label: 'Sign out', run: async () => { await logout(); navigate(base === '/admin' ? '/admin/signin' : '/signin') } },
    ].filter(Boolean)
    actions.filter(a => match(a.label)).forEach(a => out.push({ group: 'Actions', ...a }))
    remote?.projects?.forEach(p => out.push({ group: 'Projects', icon: 'project', label: p.project_name, hint: p.status, run: () => navigate(`${base}/projects/${p.project_id}`) }))
    remote?.users?.forEach(u => out.push({ group: 'Users', icon: 'user', label: u.username, hint: u.email, run: () => navigate(`/admin/users?q=${encodeURIComponent(u.email)}`) }))
    return out
  }, [q, remote, nav, base, resolved, toggle, navigate, logout])

  useEffect(() => { setSel(s => Math.min(s, Math.max(0, items.length - 1))) }, [items.length])
  useEffect(() => { listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  if (!open) return null
  const run = item => { onClose(); item.run() }
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % Math.max(1, items.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s - 1 + items.length) % Math.max(1, items.length)) }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); run(items[sel]) }
    else if (e.key === 'Escape') onClose()
  }

  let lastGroup = null
  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Icon name="search" />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setSel(0) }} onKeyDown={onKey}
                 placeholder="Search pages, projects, users or actions…" aria-label="Command" role="combobox"
                 aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[sel] ? `pal-${sel}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="dropdown-empty">No results for “{q}”.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup
            lastGroup = it.group
            return (
              <div key={`${it.group}-${it.label}-${i}`}>
                {header && <div className="palette-group">{it.group}</div>}
                <button id={`pal-${i}`} role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'sel' : ''}`}
                        onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} /> <span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd> <kbd>K</kbd> toggle</span></div>
      </div>
    </div>
  )
}
