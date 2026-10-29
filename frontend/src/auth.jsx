import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) { setReady(true); return }
    api('/api/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null) }
    window.addEventListener('flip:unauthorized', onUnauthorized)
    return () => window.removeEventListener('flip:unauthorized', onUnauthorized)
  }, [])

  const applySession = useCallback(session => {
    setToken(session.access_token)
    setUser(session.user)
    return session.user
  }, [])

  const login = useCallback(async (email, password, portal) =>
    applySession(await api('/api/auth/login', { method: 'POST', body: { email, password, portal } })), [applySession])

  const register = useCallback(async data =>
    applySession(await api('/api/auth/register', { method: 'POST', body: data })), [applySession])

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* already signed out */ }
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, setUser, applySession }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export const homeFor = user => (user?.role === 'Admin' ? '/admin' : '/app')
