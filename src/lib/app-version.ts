export function resolveAppVersion(value: unknown): string {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : '开发版'
}

export const APP_VERSION = resolveAppVersion(
  import.meta.env.VITE_APP_VERSION,
)
