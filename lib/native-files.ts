type FileProgress = { loaded: number; total: number }
type FileTarget = { agentId: string; workspaceId?: never } | { workspaceId: string; agentId?: never }
type FileDownload = FileTarget & { path: string; filename: string }
type NativeFiles = {
  version: 1 | 2 | 3
  download: (request: FileDownload & { requestId: string; accessToken?: string }, progress: (value: FileProgress) => void) => Promise<void>
  cancel: (requestId: string) => void
}

export async function downloadNativeWorkspaceFile(request: FileDownload, options: {
  signal: AbortSignal; onProgress: (value: FileProgress) => void; accessToken?: string
}): Promise<boolean> {
  const bridge = (window as Window & { __WTT_NATIVE_FILES__?: NativeFiles }).__WTT_NATIVE_FILES__
  if (bridge?.version !== 1 && bridge?.version !== 2 && bridge?.version !== 3) return false
  if (request.workspaceId && bridge.version === 1) return false
  if (bridge.version === 3 && !options.accessToken) throw new Error('Sign in before downloading')
  options.signal.throwIfAborted()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const requestId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  const cancel = () => bridge.cancel(requestId)
  options.signal.addEventListener('abort', cancel, { once: true })
  try {
    await bridge.download({ ...request, requestId, ...(bridge.version === 3 ? { accessToken: options.accessToken } : {}) }, options.onProgress)
    options.signal.throwIfAborted()
    return true
  }
  finally { options.signal.removeEventListener('abort', cancel) }
}
