import type { AppConfig } from '../../domain/types'
import { HARD_MAX_EXACT_GENERATION } from '../../domain/config'
import {
  THEMES,
  type ThemeId,
} from '../../theme/theme'

function selectThemeFromKeyboard(
  event: React.KeyboardEvent<HTMLButtonElement>,
  index: number,
  onThemeChange: (themeId: ThemeId) => void,
) {
  const direction =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? THEMES.length - 1
        : direction
          ? (index + direction + THEMES.length) % THEMES.length
          : null
  if (nextIndex === null) return

  event.preventDefault()
  onThemeChange(THEMES[nextIndex].id)
  const options = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
    '[role="radio"]',
  )
  requestAnimationFrame(() => options?.[nextIndex]?.focus())
}

interface SettingsPageProps {
  themeId: ThemeId
  onThemeChange: (themeId: ThemeId) => void
  appConfig: AppConfig
  configDraft: string
  configRecovered: boolean
  onConfigDraftChange: (value: string) => void
  onSaveConfig: () => void
  onResetConfig: () => void
}

export function SettingsPage({
  themeId,
  onThemeChange,
  appConfig,
  configDraft,
  configRecovered,
  onConfigDraftChange,
  onSaveConfig,
  onResetConfig,
}: SettingsPageProps) {
  return (
    <main className="settings-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">LOCAL SETTINGS</p>
          <h1>本机设置</h1>
          <p>调整界面外观和高级选项；所有设置只保存在当前设备。</p>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-card">
          <h2>界面主题</h2>
          <p>选择后立即生效并保存。每套主题都覆盖完整界面和响应式布局。</p>
          <div className="theme-grid" role="radiogroup" aria-label="界面主题">
            {THEMES.map((theme, index) => {
              const active = theme.id === themeId
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  className={`theme-option ${active ? 'is-active' : ''}`}
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  onKeyDown={(event) =>
                    selectThemeFromKeyboard(event, index, onThemeChange)
                  }
                >
                  <span className="theme-option-copy">
                    <strong>{theme.label}</strong>
                    <small>{theme.description}</small>
                  </span>
                  <span className="theme-option-check" aria-hidden="true">✓</span>
                  <span className="theme-swatches" aria-hidden="true">
                    {theme.previewColors.map((color) => (
                      <span key={color} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="settings-card admin-card">
          <h2>高级设置</h2>
          <p>
            指定 N 代模式默认最多展示 6 代；最短路径超过上限时只报告代数，
            不展开画布。
          </p>
          {configRecovered && (
            <p className="config-warning" role="alert">
              检测到无效配置，已使用默认值 6。请输入 1–12 的整数。
            </p>
          )}
          <label className="field">
            <span>指定代数上限</span>
            <input
              aria-label="指定代数上限"
              type="number"
              min="1"
              max="12"
              value={configDraft}
              onChange={(event) => onConfigDraftChange(event.target.value)}
            />
          </label>
          <div className="admin-actions">
            <button className="primary-button" onClick={onSaveConfig}>
              保存配置
            </button>
            <button className="quiet-button" onClick={onResetConfig}>
              恢复默认值 6
            </button>
          </div>
          <dl>
            <div>
              <dt>当前生效值</dt>
              <dd>{appConfig.pathPlanner.maxExactGeneration} 代</dd>
            </div>
            <div>
              <dt>硬性安全上限</dt>
              <dd>{HARD_MAX_EXACT_GENERATION} 代</dd>
            </div>
            <div>
              <dt>存储位置</dt>
              <dd>本机 localStorage</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}
