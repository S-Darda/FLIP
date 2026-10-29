import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = id => setToasts(t => t.filter(x => x.id !== id))
  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t.slice(-3), { id, message, kind }])
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.message}</span>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
