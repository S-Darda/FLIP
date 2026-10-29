import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getToken } from './api'
import { useAuth } from './auth'

const RealtimeContext = createContext(null)

/** One WebSocket per signed-in tab. Pages subscribe to the event types they care about. */
export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const listeners = useRef(new Set())
  const [connected, setConnected] = useState(false)
  const [feed, setFeed] = useState([])

  useEffect(() => {
    if (!user) return undefined
    let ws, pingTimer, retryTimer
    let attempt = 0
    let stopped = false

    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: getToken() }))
        pingTimer = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000)
      }
      ws.onmessage = e => {
        let event
        try { event = JSON.parse(e.data) } catch { return }
        if (event.type === 'hello') { attempt = 0; setConnected(true); return }
        if (event.type === 'pong') return
        if (event.type !== 'log' || user.role === 'Admin') {
          setFeed(f => [{ ...event, receivedAt: new Date().toISOString() }, ...f].slice(0, 200))
        }
        listeners.current.forEach(fn => fn(event))
      }
      ws.onclose = () => {
        setConnected(false)
        clearInterval(pingTimer)
        if (stopped) return
        attempt += 1
        retryTimer = setTimeout(open, Math.min(15000, 1000 * 2 ** Math.min(attempt, 4)))
      }
    }
    open()
    return () => {
      stopped = true
      clearInterval(pingTimer)
      clearTimeout(retryTimer)
      ws?.close()
      setConnected(false)
    }
  }, [user?.user_id])

  const subscribe = useCallback(fn => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  return (
    <RealtimeContext.Provider value={{ connected, subscribe, feed, clearFeed: () => setFeed([]) }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export const useRealtime = () => useContext(RealtimeContext)

/** Run `handler(event)` for every event whose type is in `types`. */
export function useRealtimeEvent(types, handler) {
  const { subscribe } = useRealtime()
  const ref = useRef(handler)
  ref.current = handler
  const key = [].concat(types).join(',')
  useEffect(() => subscribe(e => { if (key.split(',').includes(e.type)) ref.current(e) }), [subscribe, key])
}
