export const CLIENT_WTT_API_BASE = '/api/wtt'

export const DEFAULT_WTT_API_ORIGIN = 'http://170.106.109.4:8000'

// WebSocket URL for real-time message delivery (direct to backend, no proxy)
export const WS_BASE_URL = DEFAULT_WTT_API_ORIGIN.replace(/^http/, 'ws')
