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
  includeAll?: boolean;
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

export interface WorkspaceInfo {
  path: string;
  name: string;
  addedAt: string;
  lastScanAt?: string;
  fileCount: number;
  error?: string;
}

export interface RecentFile {
  path: string;
  name: string;
  workspacePath: string;
  accessedAt: string;
  extension: string;
}

export interface SearchMatch {
  filePath: string;
  relativePath: string;
  lineNumber: number;
  lineContent: string;
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
  workspace?: {
    list: () => Promise<WorkspaceInfo[]>;
    add: (folderPath?: string) => Promise<WorkspaceInfo | { error: string } | null>;
    remove: (folderPath: string) => Promise<boolean>;
    updateMeta: (folderPath: string, meta: { fileCount?: number; lastScanAt?: string }) => Promise<boolean>;
    search: (folderPath: string, query: string, maxResults?: number) =>
      Promise<{ ok: boolean; results: SearchMatch[]; error?: string }>;
    recentFiles: () => Promise<RecentFile[]>;
    trackRecent: (file: { path: string; name: string; workspacePath: string; extension: string }) => Promise<boolean>;
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
  wsPush?: {
    connect: (opts: { agentId: string; apiUrl?: string }) => Promise<{ ok: boolean }>;
    disconnect: () => Promise<{ ok: boolean }>;
    status: () => Promise<{ connected: boolean; agentId?: string; unreadCount?: number }>;
  };
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

// ── Workspace management helpers ──

/**
 * List all registered local workspaces. Desktop only.
 */
export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return [];
  const result = await bridge.workspace.list();
  return Array.isArray(result) ? result : [];
}

/**
 * Add a local folder as a workspace. Opens native folder dialog if no path given.
 * Desktop only — returns null on web.
 */
export async function addWorkspace(folderPath?: string): Promise<WorkspaceInfo | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return null;
  const result = await bridge.workspace.add(folderPath);
  if (!result || 'error' in result) return null;
  return result as WorkspaceInfo;
}

/**
 * Remove a workspace from the list (does not delete files).
 */
export async function removeWorkspace(folderPath: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return false;
  return bridge.workspace.remove(folderPath);
}

/**
 * Search file contents within a workspace folder. Desktop only.
 */
export async function searchWorkspace(
  folderPath: string,
  query: string,
  maxResults?: number
): Promise<SearchMatch[]> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return [];
  const result = await bridge.workspace.search(folderPath, query, maxResults);
  return result.ok ? result.results : [];
}

/**
 * Get list of recently accessed files. Desktop only.
 */
export async function getRecentFiles(): Promise<RecentFile[]> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return [];
  return bridge.workspace.recentFiles();
}

/**
 * Track a file as recently accessed. Desktop only.
 */
export async function trackRecentFile(file: {
  path: string;
  name: string;
  workspacePath: string;
  extension: string;
}): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.workspace) return;
  bridge.workspace.trackRecent(file);
}

/**
 * Save content to a local file via save dialog. Desktop only.
 */
export async function saveToLocal(
  content: string,
  defaultName?: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge) return false;
  const result = await bridge.fs.saveFileDialog({
    title: 'Save to Local',
    defaultPath: defaultName,
    filters: filters ?? [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.path) return false;
  const writeResult = await bridge.fs.writeFile(result.path, content);
  return writeResult.ok;
}

// ── File Bridge: register local project for agent on-demand file access ──

/**
 * Ensure the Desktop's main-process WebSocket is connected to the WTT backend.
 * This WS connection is needed for the file bridge relay: when the remote agent
 * calls wtt_local_read/write/tree MCP tools, the backend relays the request
 * to the Desktop via WS, Desktop reads the local file, and responds via WS.
 * No file content is uploaded to the server — only relayed in real-time.
 */
export async function connectDesktopWs(agentId: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.wsPush) return false;
  try {
    const status = await bridge.wsPush.status();
    if (status.connected) return true; // already connected
    await bridge.wsPush.connect({ agentId });
    console.log(`[DesktopWS] Connected for file bridge relay (agent=${agentId})`);
    return true;
  } catch (err) {
    console.warn('[DesktopWS] Connection failed:', err);
    return false;
  }
}

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

  // Step 2: Ensure Desktop WS is connected for file bridge relay
  // (agent calls wtt_local_read → backend WS relay → Desktop reads file → responds)
  connectDesktopWs(agentId).catch(() => {});

  // Step 3: Build language stats
  const extCount: Record<string, number> = {};
  for (const f of files) {
    const ext = (f.extension || '').replace(/^\./, '');
    if (ext) extCount[ext] = (extCount[ext] || 0) + 1;
  }

  // Step 4: Send project index to backend
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
