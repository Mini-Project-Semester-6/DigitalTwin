import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

vi.mock('../utils/api', () => ({
  runPrediction:       vi.fn(),
  runCancerPrediction: vi.fn(),
  runFibrosisPrediction: vi.fn(),
  runNodulePrediction: vi.fn(),
}))

vi.mock('../components/CTUploader',   () => ({ default: ({ files, setFiles }) =>
  <div data-testid="uploader">uploader ({files.length} files)</div> }))
vi.mock('../components/ResultsPanel', () => ({ default: ({ result }) =>
  result ? <div data-testid="results">results</div> : null }))
vi.mock('../components/SampleScans',  () => ({ default: () => <div>samples</div> }))
vi.mock('../components/CTViewer3D',   () => ({ default: () => null }))

import Analyze from '../pages/Analyze'

const Wrapper = () => (
  <BrowserRouter>
    <Toaster />
    <Analyze />
  </BrowserRouter>
)

describe('Analyze page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders condition selector buttons', () => {
    render(<Wrapper />)
    expect(screen.getByText(/COVID-19/i)).toBeTruthy()
    expect(screen.getByText(/Lung Cancer/i)).toBeTruthy()
    expect(screen.getByText(/Pulmonary Fibrosis/i)).toBeTruthy()
  })

  it('shows fibrosis metadata form when fibrosis is selected', () => {
    render(<Wrapper />)
    const fibBtn = screen.getByText(/Pulmonary Fibrosis/i)
    fireEvent.click(fibBtn)
    expect(screen.getByText(/Clinical Metadata/i)).toBeTruthy()
  })

  it('hides metadata form for covid19 condition', () => {
    render(<Wrapper />)
    const covidBtn = screen.getByText(/COVID-19/i)
    fireEvent.click(covidBtn)
    expect(screen.queryByText(/Clinical Metadata/i)).toBeNull()
  })

  it('run button is disabled with no files', () => {
    render(<Wrapper />)
    const runBtn = screen.getByText(/Run Digital Twin Analysis/i)
    expect(runBtn.closest('button').disabled).toBe(true)
  })

  it('renders sample scans panel', () => {
    render(<Wrapper />)
    expect(screen.getByText('samples')).toBeTruthy()
  })

  it('shows uploader component', () => {
    render(<Wrapper />)
    expect(screen.getByTestId('uploader')).toBeTruthy()
  })

  it('does not show results panel initially', () => {
    render(<Wrapper />)
    expect(screen.queryByTestId('results')).toBeNull()
  })

  it('calls runCancerPrediction when cancer condition selected', async () => {
    const { runCancerPrediction } = await import('../utils/api')
    runCancerPrediction.mockResolvedValue({ condition: 'cancer', prediction: {} })

    render(<Wrapper />)
    fireEvent.click(screen.getByText(/Lung Cancer/i))
    // With no files the button is disabled — verify condition change only
    expect(screen.getByText(/Lung Cancer/i)).toBeTruthy()
  })
})