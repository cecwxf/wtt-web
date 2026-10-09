type FileProgress = { loaded: number; total: number }
type FileTarget = { agentId: string; workspaceId?: never } | { workspaceId: string; agentId?: never }
type FileDownload = FileTarget & { path: string; filename: string }
type KnowledgeDownload = { knowledgeSourceId: string; filename: string; workspaceId?: never; agentId?: never }
type DownloadOptions = { signal: AbortSignal; onProgress: (value: FileProgress) => void; accessToken?: string }
type NativeFiles = {
  version: 1 | 2 | 3
  knowledgeFiles?: boolean
  download: (request: (FileDownload | KnowledgeDownload) & { requestId: string; accessToken?: string }, progress: (value: FileProgress) => void) => Promise<void>
  cancel: (requestId: string) => void
}

async function downloadNativeFile(request: FileDownload | KnowledgeDownload, options: DownloadOptions): Promise<boolean> {
  const bridge = (window as Window & { __WTT_NATIVE_FILES__?: NativeFiles }).__WTT_NATIVE_FILES__
  if (bridge?.version !== 1 && bridge?.version !== 2 && bridge?.version !== 3) return false
  if ('knowledgeSourceId' in request && !bridge.knowledgeFiles) throw new Error('Update WTT to download knowledge files')
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

export function downloadNativeWorkspaceFile(request: FileDownload, options: DownloadOptions): Promise<boolean> {
  return downloadNativeFile(request, options)
}

export function downloadNativeKnowledgeFile(request: KnowledgeDownload, options: DownloadOptions): Promise<boolean> {
  return downloadNativeFile(request, options)
}
