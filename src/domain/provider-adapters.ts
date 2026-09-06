import type { ProviderProfileV1 } from './agent'
import { validateProviderProfile } from './agent'
import {
  buildProviderRequest as buildProtocolRequest,
  buildProviderStreamRequest as buildProtocolStreamRequest,
  createProviderStreamAccumulator as createProtocolStreamAccumulator,
  parseProviderResponse as parseProtocolResponse,
} from './provider-protocol'
import type {
  AgentModelRequest,
  AgentModelResult,
  ProviderHttpRequest,
  ProviderStreamAccumulator,
} from './provider-protocol'

export type {
  AgentModelMessage,
  AgentModelRequest,
  AgentModelResult,
  AgentStreamEvent,
  AgentToolCall,
  ProviderHttpRequest,
  ProviderStreamAccumulator,
} from './provider-protocol'

export function buildProviderRequest(
  profileInput: ProviderProfileV1,
  apiKey: string,
  request: AgentModelRequest,
): ProviderHttpRequest {
  return buildProtocolRequest(validateProviderProfile(profileInput), apiKey, request)
}

export function buildProviderStreamRequest(
  profileInput: ProviderProfileV1,
  apiKey: string,
  request: AgentModelRequest,
): ProviderHttpRequest {
  return buildProtocolStreamRequest(validateProviderProfile(profileInput), apiKey, request)
}

export function createProviderStreamAccumulator(
  profileInput: ProviderProfileV1,
): ProviderStreamAccumulator {
  return createProtocolStreamAccumulator(validateProviderProfile(profileInput))
}

export function parseProviderResponse(
  profileInput: ProviderProfileV1,
  payload: unknown,
): AgentModelResult {
  return parseProtocolResponse(validateProviderProfile(profileInput), payload)
}
