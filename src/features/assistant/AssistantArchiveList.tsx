import { memo } from 'react'
import { DeleteIcon, EditIcon } from '../../components/ui-icons'
import { formatAppRouteHash } from '../../lib/app-route'
import type { AgentConversation } from '../../storage/agent-storage'

interface AssistantArchiveListProps {
  conversations: AgentConversation[]
  conversationId?: string
  onRenameConversation: (conversation: AgentConversation) => void | Promise<void>
  onDeleteConversation: (conversation: AgentConversation) => void | Promise<void>
}

export const AssistantArchiveList = memo(function AssistantArchiveList({ conversations, conversationId, onRenameConversation, onDeleteConversation }: AssistantArchiveListProps) {
  return (
    <div className="assistant-conversation-list">
      {conversations.map((conversation) => (
        <div className={`assistant-conversation ${conversation.id === conversationId ? 'is-active' : ''}`} key={conversation.id}>
          <a href={formatAppRouteHash({ tool: 'assistant', conversationId: conversation.id })}>
            <strong>{conversation.title}</strong>
            <small>{new Date(conversation.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
          </a>
          <span className="assistant-conversation-actions">
            <button type="button" aria-label={`重命名${conversation.title}`} data-tooltip="重命名" onClick={() => void onRenameConversation(conversation)}><EditIcon /></button>
            <button type="button" aria-label={`删除${conversation.title}`} data-tooltip="删除" onClick={() => void onDeleteConversation(conversation)}><DeleteIcon /></button>
          </span>
        </div>
      ))}
      {conversations.length === 0 && <p className="assistant-archive-empty">提出第一个问题后，记录会保存在这台设备。</p>}
    </div>
  )
})
