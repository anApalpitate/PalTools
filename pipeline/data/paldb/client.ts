import { readFile, stat, writeFile } from 'node:fs/promises'
import { REQUEST_GAP_MS } from '../config'
import { fetchWithRetry, sleep } from '../http'
import { assertWebp } from './assets'

export class PaldbClient {
  private lastRemoteRequest = 0

  constructor(
    readonly offline: boolean,
    readonly refresh: boolean,
  ) {}

  private async waitForGap(): Promise<void> {
    const remaining = REQUEST_GAP_MS - (Date.now() - this.lastRemoteRequest)
    if (remaining > 0) await sleep(remaining)
    this.lastRemoteRequest = Date.now()
  }

  async cachedText(
    url: string,
    path: string,
    forceRemote = false,
  ): Promise<string> {
    if (!this.refresh && !forceRemote) {
      try {
        return await readFile(path, 'utf8')
      } catch {
        // Continue to the explicit offline check.
      }
    }
    if (this.offline) {
      throw new Error(`离线模式缺少缓存：${path}`)
    }
    await this.waitForGap()
    const text = await (await fetchWithRetry(url)).text()
    await writeFile(path, text, 'utf8')
    return text
  }

  async webp(url: string, path: string): Promise<Buffer> {
    if (!this.refresh) {
      try {
        await stat(path)
        const cached = await readFile(path)
        assertWebp(cached)
        return cached
      } catch {
        // Continue to the explicit offline check.
      }
    }
    if (this.offline) {
      throw new Error(`离线模式缺少有效图片缓存：${path}`)
    }
    await this.waitForGap()
    const response = await fetchWithRetry(url, {
      headers: { Accept: 'image/webp,image/*' },
    })
    const data = Buffer.from(await response.arrayBuffer())
    assertWebp(data, response.headers.get('content-type'))
    await writeFile(path, data)
    return data
  }
}
