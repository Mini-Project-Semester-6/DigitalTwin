import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResultsPanel from '../components/ResultsPanel'

const covidResult = {
  condition: 'covid19',
  prediction: {
    variant: 'COVID-Positive',
    variant_index: 1,
    probabilities: { 'COVID-Negative': 0.05, 'COVID-Positive': 0.95 },
    severity_score: 0.72,
    confidence: 0.88,
  },
  mesh: {
    volume_voxels: 50000, surface_voxels: 4000,
    volume_fraction: 0.31, surface_to_volume: 0.08,
    hausdorff_approx_mm: 112, slice_count: 8,
    spatial_dims: [8, 128, 128], candidates: [],
  },
  reconstruction: { base64_png: 'iVBOR', spatial_shape: [64, 64] },
  progression: Array.from({ length: 7 }, (_, i) => ({
    step: i + 1, severity: 0.5, delta_norm: 0.1,
  })),
  metrics: { inference_time_s: 3.5, slices_processed: 8, device: 'cpu' },
}

const cancerResult = {
  condition: 'cancer',
  prediction: {
    cancer_type: 'Adenocarcinoma',
    type_index: 0,
    probabilities: {
      'Adenocarcinoma': 0.7, 'Squamous Cell': 0.1,
      'Small Cell': 0.1, 'Normal': 0.1,
    },
    severity_score: 0.65,
    confidence: 0.82,
  },
  mesh: {
    volume_voxels: 60000, surface_voxels: 5000,
    volume_fraction: 0.33, surface_to_volume: 0.083,
    hausdorff_approx_mm: 120, slice_count: 8,
    spatial_dims: [8, 128, 128], candidates: [],
  },
  progression: Array.from({ length: 7 }, (_, i) => ({
    step: i + 1, severity: 0.6, delta_norm: 0.12,
  })),
  metrics: { inference_time_s: 4.2, slices_processed: 8, device: 'cpu' },
}

const fibrosisResult = {
  condition: 'fibrosis',
  model: 'OSIC Digital Twin',
  prediction: {
    fvc_ml: 2450,
    confidence_interval_95: [1900, 3000],
    stage: 'Moderate',
    stage_index: 1,
    stage_probabilities: { Mild: 0.2, Moderate: 0.7, Severe: 0.1 },
    risk_score: 0.55,
    confidence: 0.80,
  },
  metadata_used: { age: 68, sex: 'Male', smoking_status: 'Ex-smoker',
                   baseline_fvc: 2340, weeks: 0 },
  mesh: {
    volume_voxels: 45000, surface_voxels: 3600,
    volume_fraction: 0.29, surface_to_volume: 0.08,
    hausdorff_approx_mm: 100, slice_count: 8,
    spatial_dims: [8, 128, 128], candidates: [],
  },
  progression: Array.from({ length: 7 }, (_, i) => ({
    step: i + 1, fvc_ml: 2450 - i * 18, risk: 0.55,
    stage: 'Moderate', stage_probs: {},
  })),
  metrics: { inference_time_s: 3.8, slices_processed: 8, device: 'cpu' },
}

describe('ResultsPanel — COVID-19', () => {
  it('renders null for null result', () => {
    const { container } = render(<ResultsPanel result={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders variant label', () => {
    render(<ResultsPanel result={covidResult} />)
    expect(screen.getByText('COVID-Positive')).toBeTruthy()
  })

  it('renders confidence percentage', () => {
    render(<ResultsPanel result={covidResult} />)
    expect(screen.getByText('88%')).toBeTruthy()
  })

  it('renders progression table with 7 rows', () => {
    render(<ResultsPanel result={covidResult} />)
    const stepCells = screen.getAllByText(/^T\+\d+$/)
    expect(stepCells.length).toBe(7)
  })

  it('renders mesh stats', () => {
    render(<ResultsPanel result={covidResult} />)
    expect(screen.getByText('3-D Mesh & Geometric Features')).toBeTruthy()
  })

  it('renders inference time in metrics bar', () => {
    render(<ResultsPanel result={covidResult} />)
    expect(screen.getByText('3.5s')).toBeTruthy()
  })
})

describe('ResultsPanel — Cancer', () => {
  it('renders cancer type', () => {
    render(<ResultsPanel result={cancerResult} />)
    expect(screen.getByText('Adenocarcinoma')).toBeTruthy()
  })

  it('renders four probability bars', () => {
    render(<ResultsPanel result={cancerResult} />)
    expect(screen.getByText('Adenocarcinoma')).toBeTruthy()
    expect(screen.getByText('Squamous Cell')).toBeTruthy()
    expect(screen.getByText('Small Cell')).toBeTruthy()
    expect(screen.getByText('Normal')).toBeTruthy()
  })
})

describe('ResultsPanel — Fibrosis', () => {
  it('renders FVC value', () => {
    render(<ResultsPanel result={fibrosisResult} />)
    expect(screen.getByText(/2,450/)).toBeTruthy()
  })

  it('renders stage label', () => {
    render(<ResultsPanel result={fibrosisResult} />)
    const moderateEls = screen.getAllByText('Moderate')
    expect(moderateEls.length).toBeGreaterThan(0)
  })

  it('renders CI bounds', () => {
    render(<ResultsPanel result={fibrosisResult} />)
    expect(screen.getByText(/1,900/)).toBeTruthy()
    expect(screen.getByText(/3,000/)).toBeTruthy()
  })

  it('renders metadata used section', () => {
    render(<ResultsPanel result={fibrosisResult} />)
    expect(screen.getByText(/Clinical Inputs Used/i)).toBeTruthy()
  })
}) 
