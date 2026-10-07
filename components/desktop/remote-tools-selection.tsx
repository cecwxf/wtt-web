'use client'

import type { DesktopRemoteTools } from '@/lib/desktop'

export function RemoteToolsSelection({ value, onChange, disabled, en }: {
  value: DesktopRemoteTools; onChange: (value: DesktopRemoteTools) => void; disabled: boolean; en: boolean
}) {
  return <fieldset disabled={disabled} className="space-y-3 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
    <legend className="pt-3 font-medium">{en ? 'Remote tools' : '远程工具'}</legend>
    <label className="flex flex-wrap items-center justify-between gap-2">{en ? 'Workspace files' : '工作目录文件'}
      <select value={value.files} onChange={event => onChange({ ...value, files: event.target.value as DesktopRemoteTools['files'] })} className="min-h-9 rounded-md border border-zinc-200 bg-transparent px-2 dark:border-zinc-700">
        <option value="off">{en ? 'Disabled' : '关闭'}</option><option value="read-only">{en ? 'Read & download' : '浏览与下载'}</option><option value="workspace-write">{en ? 'Read, upload & edit' : '浏览、上传与编辑'}</option>
      </select>
    </label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.terminal} onChange={event => onChange({ ...value, terminal: event.target.checked })} />{en ? 'Remote terminal' : '远程终端'}</label>
    {value.terminal && <p role="status" className="text-xs text-red-600 dark:text-red-400">{en ? 'Full OS shell access for your signed-in devices. Not limited to the workspace.' : '已登录设备可执行本机系统命令，不限于工作目录。'}</p>}
  </fieldset>
}
