import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({ baseURL: API_BASE })

/**
 * Send CT slices to the backend.
 * @param {File[]} files
 * @returns {Promise<object>}
 */

export async function runPrediction(files) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const { data } = await api.post('/predict', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function runCancerPrediction(files) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const { data } = await api.post('/predict/cancer', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function runFibrosisPrediction(files, metadata = {}) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const params = new URLSearchParams({
    age:            metadata.age            ?? 65,
    sex:            metadata.sex            ?? 'Male',
    smoking_status: metadata.smoking_status ?? 'Ex-smoker',
    baseline_fvc:   metadata.baseline_fvc   ?? 2600.0,
    weeks:          metadata.weeks          ?? 0.0,
  }).toString()
  const { data } = await api.post(`/predict/fibrosis?${params}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function runNodulePrediction(files) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  const { data } = await api.post('/predict/nodules', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getHealth()    { const { data } = await api.get('/health');     return data }
export async function getModelInfo() { const { data } = await api.get('/model-info'); return data }
