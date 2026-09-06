const fs = require('node:fs/promises')
const { TextDecoder } = require('node:util')

const DEFAULT_DEVELOPMENT_API_PATH = 'D:\\aLCYYDS\\IDM下载\\开发者api.md'
const DEVELOPMENT_PROFILE_ID = 'paltools-managed-development-deepseek'
const MAX_DOCUMENT_BYTES = 4 * 1024

function documentError(reason, code = 'PALTOOLS_DEV_PROVIDER_INVALID') {
  const error = new Error(`开发者 API 配置${reason}`)
  error.code = code
  return error
}

function parseDevelopmentProviderDocument(source) {
  if (typeof source !== 'string') throw documentError('格式无效')
  const lines = source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length !== 2) throw documentError('必须且只能包含 API Key 与模型两个字段')

  let apiKey
  let model
  for (const line of lines) {
    const modelMatch = line.match(/^模型\s*[:：]\s*(\S+)$/u)
    if (modelMatch) {
      if (model !== undefined) throw documentError('包含重复的模型字段')
      model = modelMatch[1]
      continue
    }

    const apiMatch = line.match(/^([^:：=]{1,40}):\s*(\S+)$/u)
    if (apiMatch) {
      const normalizedLabel = apiMatch[1].replace(/[^a-z]/gi, '').toLowerCase()
      if (normalizedLabel.includes('api') && normalizedLabel.includes('key')) {
        if (apiKey !== undefined) throw documentError('包含重复的 API Key 字段')
        apiKey = apiMatch[2]
        continue
      }
    }

    throw documentError('包含无法识别的字段')
  }

  if (!apiKey || !/^[A-Za-z0-9._-]{8,512}$/.test(apiKey)) {
    throw documentError('中的 API Key 格式无效')
  }
  if (!model || model.length > 200 || !/^deepseek-[A-Za-z0-9._/-]+$/i.test(model)) {
    throw documentError('中的模型必须是 DeepSeek 模型 ID')
  }

  return {
    profile: {
      schemaVersion: 1,
      id: DEVELOPMENT_PROFILE_ID,
      presetId: 'deepseek',
      displayName: '开发者 DeepSeek（仅开发版）',
      transport: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      model,
      authMode: 'bearer',
      timeoutMs: 60000,
      contextTurns: 12,
      capabilityMode: 'auto',
      extraHeaders: {},
      extraBody: {},
    },
    apiKey,
  }
}

async function loadDevelopmentProvider(filePath = process.env.PALTOOLS_DEV_API_PATH?.trim() || DEFAULT_DEVELOPMENT_API_PATH) {
  let metadata
  try {
    metadata = await fs.stat(filePath)
  } catch (error) {
    throw documentError('文件不可用', error?.code === 'ENOENT' ? 'PALTOOLS_DEV_PROVIDER_MISSING' : 'PALTOOLS_DEV_PROVIDER_UNAVAILABLE')
  }
  if (!metadata.isFile() || metadata.size === 0 || metadata.size > MAX_DOCUMENT_BYTES) {
    throw documentError(`文件大小必须在 1 到 ${MAX_DOCUMENT_BYTES} 字节之间`)
  }

  let bytes
  try {
    bytes = await fs.readFile(filePath)
  } catch {
    throw documentError('文件不可读')
  }
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES) {
    throw documentError(`文件大小必须在 1 到 ${MAX_DOCUMENT_BYTES} 字节之间`)
  }

  let source
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw documentError('文件必须使用 UTF-8 编码')
  }
  return parseDevelopmentProviderDocument(source)
}

module.exports = {
  DEFAULT_DEVELOPMENT_API_PATH,
  DEVELOPMENT_PROFILE_ID,
  MAX_DOCUMENT_BYTES,
  loadDevelopmentProvider,
  parseDevelopmentProviderDocument,
}
