import type { AssistantEntityMentionV1, AssistantMentionV1 } from '../../domain/knowledge-contract'

export type MentionCategory = AssistantEntityMentionV1['entityType']

export function MentionChips({ mentions, onEdit, onRemove, compact = false }: { mentions: AssistantMentionV1[]; onEdit?: (mention: AssistantMentionV1) => void; onRemove?: (mention: AssistantMentionV1) => void; compact?: boolean }) {
  return (
    <div className={`assistant-mention-chips ${compact ? 'is-compact' : ''}`} aria-label={compact ? '消息使用的本地引用' : '已选择的本地资料'}>
      {mentions.map((mention) => (
        <span className={`assistant-mention-chip assistant-mention-chip--${mention.kind === 'tool' ? 'tool' : mention.entityType}`} key={mentionKey(mention)}>
          {onEdit && mention.kind === 'entity' ? (
            <button type="button" className="assistant-mention-edit" aria-label={`更换${mentionDisplayLabel(mention)}`} data-tooltip={`更换${mentionDisplayLabel(mention)}`} onClick={() => onEdit(mention)}>
              <span aria-hidden="true">{mentionCategoryCode(mention.entityType)}</span>
              <strong>{mentionDisplayLabel(mention)}</strong>
            </button>
          ) : (
            <><span aria-hidden="true">{mention.kind === 'tool' ? '@' : mentionCategoryCode(mention.entityType)}</span><strong>{mentionDisplayLabel(mention)}</strong></>
          )}
          {onRemove && <button type="button" className="assistant-mention-remove" aria-label={`移除${mentionDisplayLabel(mention)}`} data-tooltip={`移除${mentionDisplayLabel(mention)}`} onClick={() => onRemove(mention)}>×</button>}
        </span>
      ))}
    </div>
  )
}

function mentionDisplayLabel(mention: AssistantMentionV1) {
  if (mention.kind === 'tool'
    && mention.name === 'find_child_by_parents'
    && typeof mention.arguments.parentA === 'string'
    && mention.arguments.parentA === mention.arguments.parentB) return `${mention.label} · 同种双亲`
  return mention.label
}

export function mentionKey(mention: AssistantMentionV1): string {
  return mention.kind === 'tool' ? `tool:${mention.name}` : `entity:${mention.entityType}:${mention.id}`
}

export function mentionCategoryLabel(category: MentionCategory): string {
  if (category === 'pal') return '帕鲁'
  if (category === 'skill') return '主动技能'
  return '掉落物'
}

export function mentionCategoryCode(category: MentionCategory): string {
  if (category === 'pal') return 'PAL'
  if (category === 'skill') return 'SKL'
  return 'ITM'
}
