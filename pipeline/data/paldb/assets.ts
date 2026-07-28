import { createHash } from 'node:crypto'

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export function assertWebp(
  data: Uint8Array,
  contentType?: string | null,
): void {
  const header = Buffer.from(data.subarray(0, 12))
  const validHeader =
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  const validType = !contentType || contentType.toLowerCase().includes('webp')

  if (!validHeader || !validType) {
    throw new Error('图片不是有效的 WebP 文件')
  }
}
