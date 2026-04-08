/**
 * Desktop detection and IPC bridge for WTT Desktop (Electron).
 *
 * When running inside Electron, `window.wttDesktop` is injected by preload.ts.
 * This module provides typed access and graceful fallbacks for web.
 */

interface FileDialogResult {
  canceled: boolean;
  files: Array<{ path: string; name: string; size: number }>;
}

interface FolderDialogResult {
  canceled: boolean;
  path: string | null;
}

interface ReadFileResult {
  ok: boolean;
  content?: string;
  size?: number;
  error?: string;
}

interface ReadDirResult {
  ok: boolean;
  entries: Array<{
    name: string;
    isDirectory: boolean;
    isFile: boolean;
    path: string;
    size: number;
  }>;
  error?: string;
}

interface SaveDialogResult {
  canceled: boolean;
  path: string | null;
}

export interface ScanFolderOptions {
  extensions?: string[];
  maxDepth?: number;
  maxFileSize?: number;
  exclude?: string[];
  includeBinary?: boolean;
}

export interface ScannedFile {
  path: string;
  name: string;
  relativePath: string;
  size: number;
  hash: string;
  mtime: string;
  isText: boolean;
  extension: string;
}

interface ScanFolderResult {
  ok: boolean;
  files: ScannedFile[];
  error?: string;
}

interface BatchReadResult {
  path: string;
  ok: boolean;
  content?: string;
  size?: number;
  error?: string;
}

interface FileChangedEvent {
  watchId: string;
  eventType: string;
  filename: string;
  fullPath: string;
  exists: boolean;
  hash: string | null;
}

interface WttDesktopBridge {
  isDesktop: true;
  platform: string;
  fs: {
    openFileDialog: (options?: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      multiple?: boolean;
    }) => Promise<FileDialogResult>;
    openFolderDialog: (options?: {
      title?: string;
    }) => Promise<FolderDialogResult>;
    readFile: (path: string, encoding?: string) => Promise<ReadFileResult>;
    readDir: (path: string) => Promise<ReadDirResult>;
    writeFile: (path: string, content: string) => Promise<{ ok: boolean; error?: string }>;
    saveFileDialog: (options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<SaveDialogResult>;
  };
  localSync: {
    scanFolder: (folderPath: string, options?: ScanFolderOptions) => Promise<ScanFolderResult>;
    readFilesBatch: (filePaths: string[]) => Promise<{ results: BatchReadResult[] }>;
    fileHash: (filePath: string) => Promise<{ ok: boolean; hash?: string; error?: string }>;
    watchFolder: (folderPath: string) => Promise<{ ok: boolean; watchId?: string; error?: string }>;
    stopWatch: (watchId: string) => Promise<{ ok: boolean }>;
    onFileChanged: (callback: (data: FileChangedEvent) => void) => () => void;
  };
  notify: (title: string, body: string) => Promise<void>;
  getVersion: () => Promise<string>;
}

declare global {
  interface Window {
    wttDesktop?: WttDesktopBridge;
  }
}

/** True when running inside WTT Desktop (Electron) */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.wttDesktop?.isDesktop;
}

/** Get the desktop bridge, or null if not in Electron */
export function getDesktopBridge(): WttDesktopBridge | null {
  if (typeof window !== "undefined" && window.wttDesktop?.isDesktop) {
    return window.wttDesktop;
  }
  return null;
}

/**
 * Open a native file picker. Returns selected file paths, or empty array.
 * Falls back to null outside Electron.
 */
export async function pickLocalFiles(options?: {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
}): Promise<Array<{ path: string; name: string; size: number }> | null> {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  const result = await bridge.fs.openFileDialog(options);
  return result.canceled ? [] : result.files;
}

/**
 * Read a local file by path. Only works in Electron.
 */
export async function readLocalFile(
  filePath: string,
  encoding?: string
): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  const result = await bridge.fs.readFile(filePath, encoding);
  return result.ok ? (result.content ?? null) : null;
}

/**
 * Pick a folder and list its contents. Only works in Electron.
 */
export async function pickAndReadFolder(title?: string) {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  const folder = await bridge.fs.openFolderDialog({ title });
  if (folder.canceled || !folder.path) return null;
  const contents = await bridge.fs.readDir(folder.path);
  return { path: folder.path, entries: contents.entries };
}

/**
 * Scan a local folder recursively and return all supported files.
 * Desktop only — returns null on web.
 */
export async function scanLocalFolder(
  folderPath: string,
  options?: ScanFolderOptions
): Promise<{ path: string; files: ScannedFile[] } | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.localSync) return null;
  const result = await bridge.localSync.scanFolder(folderPath, options);
  if (!result.ok) return null;
  return { path: folderPath, files: result.files };
}

/**
 * Pick a folder via native dialog, then scan it for supported files.
 * Desktop only — returns null on web.
 */
export async function pickAndScanFolder(
  title?: string,
  options?: ScanFolderOptions
): Promise<{ path: string; files: ScannedFile[] } | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.localSync) return null;
  const folder = await bridge.fs.openFolderDialog({ title: title ?? "Select folder to import" });
  if (folder.canceled || !folder.path) return null;
  const result = await bridge.localSync.scanFolder(folder.path, options);
  if (!result.ok) return null;
  return { path: folder.path, files: result.files };
}

/**
 * Read multiple files in batch. Desktop only.
 */
export async function readFilesBatch(
  filePaths: string[]
): Promise<BatchReadResult[] | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.localSync) return null;
  const result = await bridge.localSync.readFilesBatch(filePaths);
  return result.results;
}

/**
 * Start watching a folder for changes. Desktop only.
 * Returns a cleanup function to stop watching, or null.
 */
export async function watchLocalFolder(
  folderPath: string,
  onChanged: (data: FileChangedEvent) => void
): Promise<(() => void) | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.localSync) return null;
  const result = await bridge.localSync.watchFolder(folderPath);
  if (!result.ok || !result.watchId) return null;
  const unsub = bridge.localSync.onFileChanged(onChanged);
  const watchId = result.watchId;
  return () => {
    unsub();
    bridge.localSync.stopWatch(watchId);
  };
}

// ── File Bridge: register local project for agent on-demand file access ──

/**
 * Register a local project with the WTT backend so the agent can read files
 * on demand via WebSocket relay (Desktop file bridge).
 *
 * The Desktop's main process WS connection handles incoming file_request
 * messages and serves files from disk without uploading to the server.
 */
export async function registerFileBridge(
  taskId: string,
  agentId: string,
  projectRoot: string,
  files: ScannedFile[],
  apiBase: string = '/api/wtt'
): Promise<boolean> {
  try {
    const fileTree = files.map(f => ({
      path: f.relativePath,
      name: f.name,
      size: f.size,
      isText: f.isText,
      extension: f.extension,
    }));
    const resp = await fetch(`${apiBase}/file-bridge/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        agent_id: agentId,
        project_root: projectRoot,
        file_tree: fileTree,
      }),
    });
    if (!resp.ok) {
      console.warn('[FileBridge] Registration failed:', resp.status);
      return false;
    }
    console.log(`[FileBridge] Registered project for task ${taskId}: ${projectRoot} (${files.length} files)`);
    return true;
  } catch (err) {
    console.warn('[FileBridge] Registration error:', err);
    return false;
  }
}

/**
 * Check if file bridge is available for a task.
 */
export async function checkFileBridge(
  taskId: string,
  apiBase: string = '/api/wtt'
): Promise<{ registered: boolean; online: boolean }> {
  try {
    const resp = await fetch(`${apiBase}/file-bridge/${taskId}/status`);
    if (!resp.ok) return { registered: false, online: false };
    return await resp.json();
  } catch {
    return { registered: false, online: false };
  }
}

/**
 * Register file bridge AND send project index to backend.
 * Combines registerFileBridge + POST /tasks/{id}/index-project in one call.
 */
export async function indexLocalProject(
  taskId: string,
  agentId: string,
  projectRoot: string,
  files: ScannedFile[],
  apiBase?: string,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; indexed_files?: number; key_files?: string[] }> {
  // Step 1: Register file bridge for on-demand file access
  await registerFileBridge(taskId, agentId, projectRoot, files, apiBase);

  // Step 2: Build language stats
  const extCount: Record<string, number> = {};
  for (const f of files) {
    const ext = (f.extension || '').replace(/^\./, '');
    if (ext) extCount[ext] = (extCount[ext] || 0) + 1;
  }

  // Step 3: Send project index to backend
  try {
    const baseUrl = apiBase || (typeof window !== 'undefined' && (window as unknown as Record<string, string>).__WTT_API_BASE) || '';
    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
    const resp = await fetch(`${baseUrl}/tasks/${taskId}/index-project`, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify({
        project_root: projectRoot,
        file_tree: files.map(f => ({
          path: f.relativePath,
          name: f.name,
          size: f.size,
          isText: f.isText,
          extension: f.extension,
        })),
        language_stats: extCount,
      }),
    });
    if (!resp.ok) {
      console.warn('[IndexProject] Backend returned', resp.status);
      return { ok: false };
    }
    const data = await resp.json();
    console.log(`[IndexProject] Indexed ${data.indexed_files} files for task ${taskId}`);
    return { ok: true, indexed_files: data.indexed_files, key_files: data.key_files };
  } catch (err) {
    console.warn('[IndexProject] Error:', err);
    return { ok: false };
  }
}

/**
 * Unregister a local project file bridge.
 */
export async function unregisterFileBridge(
  taskId: string,
  apiBase: string = '/api/wtt'
): Promise<void> {
  try {
    await fetch(`${apiBase}/file-bridge/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  } catch {
    // best effort
  }
}
