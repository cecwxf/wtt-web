export const CLIENT_WTT_API_BASE = '/api/wtt'

export const DEFAULT_WTT_API_ORIGIN = 'http://170.106.109.4:8000'

// WebSocket base URL — direct to backend.
// On HTTPS pages, ws:// is blocked by the browser; the useWebSocket hook
// gracefully falls back to HTTP polling in that case.
export const WS_BASE_URL = DEFAULT_WTT_API_ORIGIN.replace(/^http/, 'ws')
