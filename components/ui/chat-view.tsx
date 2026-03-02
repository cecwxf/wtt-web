'use client'

import { Send } from 'lucide-react'
import { useState } from 'react'

export interface ChatMessage {
  message_id: string
  sender_id: string
  sender_type: 'human' | 'agent'
  content: string
  timestamp: string
  semantic_type?: string
}

interface ChatViewProps {
  topicName: string
  messages: ChatMessage[]
  currentAgentId: string
  onSendMessage: (content: string) => Promise<void>
  loading?: boolean
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

function formatDateGroup(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)

    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    if (isToday) return 'Today'

    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate()

    if (isYesterday) return 'Yesterday'

    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return 'Unknown Date'
  }
}

export function ChatView({ topicName, messages, currentAgentId, onSendMessage, loading }: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!draft.trim()) return

    setSending(true)
    try {
      await onSendMessage(draft.trim())
      setDraft('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date
  const groupedMessages: Array<{ label: string; messages: ChatMessage[] }> = []
  messages.forEach((message) => {
    const label = formatDateGroup(message.timestamp)
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (!lastGroup || lastGroup.label !== label) {
      groupedMessages.push({ label, messages: [message] })
    } else {
      lastGroup.messages.push(message)
    }
  })

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="truncate text-lg font-semibold">{topicName}</h2>
        <p className="mt-1 text-xs text-[#7d8e9e]">{messages.length} messages</p>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_20%_80%,#2ea6ff0f_0%,transparent_60%),radial-gradient(ellipse_at_80%_20%,#00d4aa0f_0%,transparent_60%)] px-4 py-4 sm:px-5">
        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#2ea6ff]" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="pt-20 text-center text-sm text-[#7d8e9e]">
            No messages yet. Start the conversation!
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="rounded-full bg-[#1c2733] px-3 py-1 text-[11px] text-[#6f8396]">
                {group.label}
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2">
              {group.messages.map((message) => {
                const isMine = message.sender_id === currentAgentId

                return (
                  <div key={message.message_id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        isMine
                          ? 'bg-[#2b5278] text-white'
                          : 'border border-white/10 bg-[#1c2733] text-[#d7e4ef]'
                      } ${isMine ? 'rounded-tr-md' : 'rounded-tl-md'}`}
                    >
                      {!isMine && (
                        <p className="mb-1 text-xs font-semibold text-[#2ea6ff]">{message.sender_id}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <div className={`mt-2 text-[10px] ${isMine ? 'text-white/65' : 'text-[#6f8396]'}`}>
                        {formatTime(message.timestamp)}
                        {message.semantic_type && ` · ${message.semantic_type}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 bg-[#17212b] p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${topicName}...`}
            rows={1}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-full border border-white/10 bg-[#1c2733] px-4 py-2.5 text-sm text-[#e8edf2] outline-none focus:border-[#2ea6ff]"
          />
          <button
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea6ff] text-white transition hover:bg-[#1f94ec] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send"
          >
            {sending ? '...' : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#7d8e9e]">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}
