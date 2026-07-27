/// <reference lib="webworker" />

import {
  planBreedingPath,
  type PathPlanRequest,
} from '../domain/breeding-path'

interface WorkerRequest {
  requestId: number
  payload: PathPlanRequest
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, payload } = event.data
  const result = planBreedingPath(payload)
  self.postMessage({ requestId, result })
}

export {}
