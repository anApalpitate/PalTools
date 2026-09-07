import { SendIcon, StopIcon } from '../../components/ui-icons'
import { formatAppRouteHash } from '../../lib/app-route'
import { localAssetUrl } from '../../lib/assets'
import { MentionChips, mentionCategoryCode } from './AssistantMentions'
import { MENTION_LIST_ID, type AssistantComposerController } from './useAssistantComposer'
import type { AssistantConversationController } from './useAssistantConversation'

export function AssistantComposer({ composer, conversation }: { composer: AssistantComposerController; conversation: AssistantConversationController }) {
  const { draft, mentions, mentionOpen, mentionQuery, mentionIndex, mentionPanelStyle, composerError, composerFocused, composerRef, composerRootRef, mentionOptions, groupedMentionOptions, composerValidation, setComposerFocused, setMentionIndex, editMention, removeMention, openMentionPicker, selectMention, onDraftChange, onComposerKeyDown } = composer
  const { profiles, activeProfile, activeModelId, activeModel, conversationReady, conversationProfile, conversationModelId, conversationProfileUnavailable, profileSaving, busy, lastUserMessage, send, stop, switchProfile } = conversation
  const canSend = Boolean(activeProfile && activeModel && conversationReady && !conversationProfileUnavailable && !busy && !profileSaving && !mentionOpen && (draft.trim() || mentions.length) && !composerValidation.error)

  return (
          <div ref={composerRootRef} className="assistant-composer">
            {mentionOpen && (
              <div className="assistant-mention-panel" style={mentionPanelStyle}>
                <div className="assistant-mention-heading"><strong>选择帕鲁、技能或物品</strong><span role="status" aria-live="polite">{mentionQuery ? `搜索“${mentionQuery}”` : '输入名称、拼音、编号或 ID'} · {mentionOptions.length} 项</span></div>
                <div id={MENTION_LIST_ID} className="assistant-mention-list" role="listbox" aria-label="帕鲁、技能与物品建议">
                  {mentionOptions.length === 0 && <p className="assistant-mention-empty">没有匹配项。按 Esc 关闭后可保留普通 @ 文本。</p>}
                  {groupedMentionOptions.map((group) => (
                    <div className="assistant-mention-group" role="group" aria-label={group.label} key={group.category}>
                      <span className="assistant-mention-group-label">{group.label}</span>
                      {group.options.map(({ option, index }) => (
                        <button id={`assistant-mention-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === mentionIndex} data-mention-kind={option.category} className={index === mentionIndex ? 'is-active' : ''} key={option.key} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionIndex(index)} onClick={() => selectMention(option)}>
                          {option.imagePath
                            ? <img className="assistant-mention-thumbnail" src={localAssetUrl(option.imagePath)} alt="" width="34" height="34" loading="lazy" />
                            : <span className={`assistant-mention-kind assistant-mention-kind--${option.category}`} aria-hidden="true">{mentionCategoryCode(option.category)}</span>}
                          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <small className="assistant-mention-help">↑↓ 选择 · Enter/Tab 添加 · Esc 关闭</small>
              </div>
            )}
            {!!mentions.length && <MentionChips mentions={mentions} onEdit={editMention} onRemove={removeMention} />}
            <textarea
              ref={composerRef}
              name="assistant-question"
              autoComplete="off"
              value={draft}
              rows={2}
              maxLength={2000}
              aria-label="向帕鲁助手提问"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-keyshortcuts="Control+Enter Meta+Enter Shift+Enter"
              aria-controls={mentionOpen ? MENTION_LIST_ID : undefined}
              aria-activedescendant={mentionOpen && mentionOptions[mentionIndex] ? `assistant-mention-option-${mentionIndex}` : undefined}
              aria-describedby={[composerFocused ? 'assistant-composer-hint' : '', composerError || (mentions.length > 0 && composerValidation.error) ? 'assistant-composer-error' : ''].filter(Boolean).join(' ') || undefined}
              placeholder="输入问题，或用 @ 添加帕鲁、技能和物品…"
              onChange={(event) => onDraftChange(event.target.value, event.target.selectionStart)}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={(event) => onComposerKeyDown(event, () => void send())}
            />
            {(composerError || (mentions.length > 0 && composerValidation.error)) && <p id="assistant-composer-error" className="assistant-composer-error" role="alert">{composerError || composerValidation.error}</p>}
            <div className="assistant-composer-bar">
              <div className="assistant-composer-guidance">
                <button type="button" className="assistant-mention-trigger" aria-controls={MENTION_LIST_ID} aria-expanded={mentionOpen} aria-haspopup="listbox" onClick={() => openMentionPicker()}><span aria-hidden="true">@</span><span>添加资料</span></button>
                {profiles.length > 0
                  ? (
                    <label className="assistant-model-picker">
                      <span>模型</span>
                      <select name="assistant-profile" autoComplete="off" aria-label="模型服务" aria-busy={profileSaving} value={activeProfile && activeModelId ? modelTargetValue(activeProfile.id, activeModelId) : ''} disabled={busy || profileSaving || !conversationReady} onChange={(event) => void switchProfile(event.target.value)}>
                        {conversationProfileUnavailable && <option value="" disabled>原模型不可用，请重新选择</option>}
                        {profiles.map((profile) => {
                          const selectable = profile.models.filter((model) => model.enabled || (profile.id === conversationProfile?.id && model.modelId === conversationModelId))
                          return <optgroup key={profile.id} label={profile.displayName}>{selectable.map((model) => <option key={model.modelId} value={modelTargetValue(profile.id, model.modelId)}>{model.label || model.modelId}{!model.enabled ? '（已隐藏）' : ''}</option>)}</optgroup>
                        })}
                      </select>
                    </label>
                  )
                  : <a className="assistant-model-setup" href={formatAppRouteHash({ tool: 'settings' })}>配置模型</a>}
                {composerFocused && <span id="assistant-composer-hint" className="assistant-composer-hint">Enter 换行 · Ctrl/⌘/Shift + Enter 发送</span>}
              </div>
              <div className="assistant-composer-actions">
                {lastUserMessage && !busy && <button type="button" className="assistant-regenerate" disabled={!activeProfile || !activeModel || conversationProfileUnavailable || profileSaving || !conversationReady} onClick={() => void send(lastUserMessage.content, lastUserMessage.mentions ?? [])}>重新生成</button>}
                {busy
                  ? <button type="button" className="assistant-stop" aria-label="停止" data-tooltip="停止生成" onClick={stop}><StopIcon /></button>
                  : <button type="button" className="assistant-send" aria-label="发送" data-tooltip="发送" disabled={!canSend} onClick={() => void send()}><SendIcon /></button>}
              </div>
            </div>
          </div>
  )
}

function modelTargetValue(profileId: string, modelId: string): string {
  return `${encodeURIComponent(profileId)}|${encodeURIComponent(modelId)}`
}
