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
