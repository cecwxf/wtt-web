const FALLBACK_ATTACHMENT_MIME = 'application/octet-stream'

const EXTENSION_MIME: Record<string, string> = {
  bib: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'text/xml',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  zip: 'application/zip',
}

export function attachmentMimeType(file: File): string {
  const browserType = file.type?.trim()
  if (browserType) return browserType
  const ext = file.name.split('.').pop()?.toLowerCase()
  return (ext && EXTENSION_MIME[ext]) || FALLBACK_ATTACHMENT_MIME
}
