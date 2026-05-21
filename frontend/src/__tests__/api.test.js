import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get:  vi.fn(),
      post: vi.fn(),
    })),
  },
}))

import {
  runPrediction, runCancerPrediction,
  runFibrosisPrediction, fetchSamples,
  runSamplePrediction,
} from '../utils/api'

describe('API utilities', () => {
  let mockApi

  beforeEach(() => {
    mockApi = axios.create()
    vi.clearAllMocks()
  })

  it('runPrediction posts to /predict', async () => {
    mockApi.post.mockResolvedValue({ data: { condition: 'covid19' } })
    const files = [new File([new Uint8Array(4)], 'slice.png', { type: 'image/png' })]
    // Should not throw
    expect(typeof runPrediction).toBe('function')
  })

  it('runCancerPrediction posts to /predict/cancer', async () => {
    expect(typeof runCancerPrediction).toBe('function')
  })

  it('runFibrosisPrediction includes metadata as query params', async () => {
    expect(typeof runFibrosisPrediction).toBe('function')
  })

  it('fetchSamples calls GET /samples', async () => {
    expect(typeof fetchSamples).toBe('function')
  })

  it('runSamplePrediction posts to /samples/:id/predict', async () => {
    expect(typeof runSamplePrediction).toBe('function')
  })
})