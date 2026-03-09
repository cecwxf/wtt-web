export const CLIENT_WTT_API_BASE = '/api/wtt'

export const DEFAULT_WTT_API_ORIGIN =
  process.env.NEXT_PUBLIC_WTT_API_URL || 'http://170.106.109.4:8000'

// WebSocket base URL — derives wss:// from https:// API origin, ws:// from http://
export const WS_BASE_URL = DEFAULT_WTT_API_ORIGIN.replace(/^http/, 'ws')
