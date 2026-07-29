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
}

export function SettingsPage({
  themeId,
  onThemeChange,
}: SettingsPageProps) {
  return (
    <main className="settings-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">LOCAL SETTINGS</p>
          <h1>本机设置</h1>
          <p>调整界面外观；所有设置只保存在当前设备。</p>
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
      </div>
    </main>
  )
}
