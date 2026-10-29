const TOKEN_KEY = 'flip.token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable: session lasts until reload */ }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function errorMessage(data, status) {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d.map(e => {
      const field = Array.isArray(e.loc) ? e.loc.filter(p => p !== 'body').join('.') : ''
      const msg = (e.msg || '').replace(/^Value error, /, '')
      return field ? `${field}: ${msg}` : msg
    }).join('; ')
  }
  return status >= 500 ? 'The server had a problem. Try again in a moment.' : `Request failed (${status})`
}

export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(path, { method, headers, body: payload, signal })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the FLIP server. Is the backend running?', 0)
  }
  if (res.status === 401 && token) window.dispatchEvent(new Event('flip:unauthorized'))
  if (res.status === 204) return null
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(errorMessage(isJson ? data : null, res.status), res.status)
  return data
}

export function qs(params) {
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') s.set(k, v) })
  const str = s.toString()
  return str ? `?${str}` : ''
}

export async function download(path, fallbackName) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try { msg = (await res.json()).detail || msg } catch { /* not json */ }
    throw new ApiError(msg, res.status)
  }
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
