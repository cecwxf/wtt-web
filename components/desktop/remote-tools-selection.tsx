'use client'

import type { DesktopRemoteTools } from '@/lib/desktop'

export function RemoteToolsSelection({ value, onChange, disabled, en, previewSupported = false }: {
  value: DesktopRemoteTools; onChange: (value: DesktopRemoteTools) => void; disabled: boolean; en: boolean; previewSupported?: boolean
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
    {previewSupported && <>
      <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value.previewPorts?.length)} onChange={event => onChange({ ...value, previewPorts: event.target.checked ? [3000] : [] })} />{en ? 'Public development preview' : '公开开发预览'}</label>
      {Boolean(value.previewPorts?.length) && <>
        <label className="flex items-center justify-between gap-2">{en ? 'Approved port' : '授权端口'}<input type="number" min={1024} max={65535} value={value.previewPorts?.[0] ?? 3000} onChange={event => { const port = Number(event.target.value); onChange({ ...value, previewPorts: [Number.isInteger(port) ? port : 0] }) }} className="min-h-9 w-24 rounded-md border border-zinc-200 bg-transparent px-2 dark:border-zinc-700" /></label>
        <p role="status" className="text-xs text-red-600 dark:text-red-400">{en ? 'Anyone with a preview link can access this service. Links expire after 15 minutes. Never expose private services.' : '持有预览链接即可访问该服务。链接 15 分钟后失效，请勿公开私密服务。'}</p>
      </>}
    </>}
  </fieldset>
}
