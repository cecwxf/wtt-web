type FileProgress = { loaded: number; total: number }
type NativeFiles = {
  version: 1
  download: (request: { requestId: string; agentId: string; path: string; filename: string }, progress: (value: FileProgress) => void) => Promise<void>
  cancel: (requestId: string) => void
}

export async function downloadNativeWorkspaceFile(request: { agentId: string; path: string; filename: string }, options: {
  signal: AbortSignal; onProgress: (value: FileProgress) => void
}): Promise<boolean> {
  const bridge = (window as Window & { __WTT_NATIVE_FILES__?: NativeFiles }).__WTT_NATIVE_FILES__
  if (bridge?.version !== 1) return false
  options.signal.throwIfAborted()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const requestId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  const cancel = () => bridge.cancel(requestId)
  options.signal.addEventListener('abort', cancel, { once: true })
  try { await bridge.download({ ...request, requestId }, options.onProgress); return true }
  finally { options.signal.removeEventListener('abort', cancel) }
}
