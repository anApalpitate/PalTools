const USER_AGENT =
  'PalTools/0.1 (local, non-commercial data builder; +https://github.com/)'

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')

  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1_000, 1_000)
    }

    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) {
      return Math.max(date - Date.now(), 1_000)
    }
  }

  return 1_000 * 2 ** attempt
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: '*/*',
          'User-Agent': USER_AGENT,
          ...init.headers,
        },
        signal: controller.signal,
      })

      if (response.ok) {
        return response
      }

      lastError = new Error(`HTTP ${response.status}: ${url}`)
      if (response.status !== 429 && response.status < 500) {
        throw lastError
      }

      await sleep(retryDelay(response, attempt))
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await sleep(1_000 * 2 ** attempt)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`请求失败：${url}`)
}
