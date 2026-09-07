import { memo } from 'react'
import type { KnowledgeEvidence } from '../../domain/knowledge-contract'
import type { AgentMessage } from '../../storage/agent-storage'
import { MentionChips } from './AssistantMentions'

interface AssistantMessagesProps {
  messages: AgentMessage[]
  evidenceByMessage: Record<string, KnowledgeEvidence[]>
  onShowEvidence: (messageId: string, opener: HTMLElement) => void
}

export const AssistantMessages = memo(function AssistantMessages({ messages, evidenceByMessage, onShowEvidence }: AssistantMessagesProps) {
  return (
    <>
      {messages.map((message) => (
        <article className={`assistant-message assistant-message--${message.role} ${message.status === 'error' ? 'is-error' : ''}`} key={message.id}>
          {message.role === 'assistant' && <button type="button" className="assistant-evidence-index" aria-label="查看回答的本地证据" data-tooltip="查看本地证据" onClick={(event) => onShowEvidence(message.id, event.currentTarget)}>{String((evidenceByMessage[message.id] ?? []).length).padStart(2, '0')}</button>}
          <div className="assistant-message-body">
            <span>{message.role === 'user' ? '你' : '研究助手'}</span>
            {!!message.mentions?.length && <MentionChips mentions={message.mentions} compact />}
            {message.content && <p>{message.content}</p>}
            {message.role === 'assistant' && <footer><span>{message.providerName} · {message.model}</span>{(evidenceByMessage[message.id] ?? []).length > 0 && <button type="button" onClick={(event) => onShowEvidence(message.id, event.currentTarget)}>依据 {(evidenceByMessage[message.id] ?? []).length} 条本地记录</button>}</footer>}
          </div>
        </article>
      ))}
    </>
  )
})
