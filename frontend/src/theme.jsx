import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const KEY = 'flip.theme'
const ThemeContext = createContext(null)

function read() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

function systemDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** mode is 'light' | 'dark' | 'system'; `resolved` is what is actually showing. */
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(read)
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const on = e => setSysDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (mode === 'system') delete root.dataset.theme
    else root.dataset.theme = mode
    try { localStorage.setItem(KEY, mode) } catch { /* storage unavailable */ }
  }, [mode])

  const resolved = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode
  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved])

  return <ThemeContext.Provider value={{ mode, resolved, setMode, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
