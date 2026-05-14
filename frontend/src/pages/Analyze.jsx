import { useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2, FlaskConical, Trash2, Download } from 'lucide-react'
import CTUploader from '../components/CTUploader'
import ResultsPanel from '../components/ResultsPanel'
import { runPrediction, runCancerPrediction, runFibrosisPrediction, runNodulePrediction } from '../utils/api'
import SampleScans from '../components/SampleScans'

export default function Analyze() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [condition, setCondition] = useState('covid19')
  const [step, setStep] = useState('')
  const [fibrosisMeta, setFibrosisMeta] = useState({
    age: 65,
    sex: 'Male',
    smoking_status: 'Ex-smoker',
    baseline_fvc: 2600,
    weeks: 0,
  })

  const STEPS = [
    'Preprocessing CT slices…',
    'Running EfficientNet-B0 encoder…',
    'Computing geometric features…',
    'Digital Twin forward pass…',
    'Simulating disease progression…',
    'Decoding latent state…',
  ]

  const handleSampleResult = (data) => {
    setResult(data)
    // Sync the condition selector to match the sample's condition
    if (data.condition) setCondition(data.condition)
  }

  const handleRun = async () => {
    if (!files.length) { toast.error('Please upload at least one CT slice.'); return }
    setLoading(true); setResult(null)
    let si = 0; setStep(STEPS[0])
    const interval = setInterval(() => { si = (si + 1) % STEPS.length; setStep(STEPS[si]) }, 900)
    try {
      let data
      if (condition === 'cancer') data = await runCancerPrediction(files)
      else if (condition === 'fibrosis') data = await runFibrosisPrediction(files, fibrosisMeta)
      else if (condition === 'nodules') data = await runNodulePrediction(files)
      else data = await runPrediction(files)
      setResult(data)
      toast.success(`Analysis complete`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Server error')
    } finally { clearInterval(interval); setStep(''); setLoading(false) }
  }

  const handleReset = () => { setFiles([]); setResult(null) }

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url, download: `lung-twin-report-${Date.now()}.json`
    })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="font-display font-700 text-3xl tracking-tight">CT Scan Analysis</h1>
        <p className="text-sm opacity-50 mt-1">
          Upload one or more PNG / JPEG CT slices · the 2.5D encoder automatically stacks them.
        </p>
      </div>

      {/* Upload area */}
      <div className="rounded-2xl p-6 space-y-5"
        style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
        {/* Condition selector */}
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'covid19', label: 'COVID-19', color: 'var(--cyan)' },
            { id: 'cancer', label: 'Lung Cancer', color: 'var(--coral)' },
            { id: 'fibrosis', label: 'Pulmonary Fibrosis', color: 'var(--lavender)' },
            // { id: 'nodules', label: 'Nodule Detection', color: 'var(--teal)' },
    
          ].map(({ id, label, color, disabled }) => (
            <button
              key={id}
              disabled={disabled}
              onClick={() => !disabled && setCondition(id)}
              className="px-4 py-2 rounded-xl text-sm font-mono transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: condition === id ? `${color}22` : 'var(--panel)',
                border: `1px solid ${condition === id ? color : 'var(--rim)'}`,
                color: condition === id ? color : '#7a94b0',
              }}>
              {label}{disabled ? ' (soon)' : ''}
            </button>
          ))}
        </div>

        {condition === 'fibrosis' && (
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--panel)', border: '1px solid rgba(155,138,255,0.3)' }}>
            <p className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--lavender)' }}>
              Clinical Metadata <span className="opacity-50 normal-case">(optional — improves accuracy)</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Age */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono opacity-50">Age</label>
                <input
                  type="number" min={0} max={120}
                  value={fibrosisMeta.age}
                  onChange={e => setFibrosisMeta(p => ({ ...p, age: +e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--rim)', color: '#e2eaf4' }}
                />
              </div>
              {/* Sex */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono opacity-50">Sex</label>
                <select
                  value={fibrosisMeta.sex}
                  onChange={e => setFibrosisMeta(p => ({ ...p, sex: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--rim)', color: '#e2eaf4' }}>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
              {/* Smoking */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono opacity-50">Smoking Status</label>
                <select
                  value={fibrosisMeta.smoking_status}
                  onChange={e => setFibrosisMeta(p => ({ ...p, smoking_status: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--rim)', color: '#e2eaf4' }}>
                  <option value="Never">Never</option>
                  <option value="Ex-smoker">Ex-smoker</option>
                  <option value="Currently">Currently Smoking</option>
                </select>
              </div>
              {/* Baseline FVC */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono opacity-50">Baseline FVC (mL)</label>
                <input
                  type="number" min={500} max={9000} step={50}
                  value={fibrosisMeta.baseline_fvc}
                  onChange={e => setFibrosisMeta(p => ({ ...p, baseline_fvc: +e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--rim)', color: '#e2eaf4' }}
                />
              </div>
              {/* Weeks */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono opacity-50">Weeks since baseline</label>
                <input
                  type="number" min={-12} max={133}
                  value={fibrosisMeta.weeks}
                  onChange={e => setFibrosisMeta(p => ({ ...p, weeks: +e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--rim)', color: '#e2eaf4' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Sample scans from Atlas */}
        <SampleScans
          onResult={handleSampleResult}
          currentCondition={condition}
        />

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--rim)' }} />
          <span className="text-xs font-mono opacity-40">or upload your own</span>
          <div className="flex-1 h-px" style={{ background: 'var(--rim)' }} />
        </div>

        <CTUploader files={files} setFiles={setFiles} />

        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={loading || !files.length}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-display font-600 text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: loading || !files.length ? 'var(--rim)' : 'var(--cyan)',
              color: loading || !files.length ? '#7a94b0' : 'var(--deep)'
            }}>
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> {step}</>
              : <><FlaskConical size={16} /> Run Digital Twin Analysis</>
            }
          </button>

          {(files.length > 0 || result) && (
            <button onClick={handleReset}
              className="p-3 rounded-xl transition-colors"
              style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}
              title="Reset">
              <Trash2 size={16} style={{ color: 'var(--coral)' }} />
            </button>
          )}

          {result && (
            <button onClick={handleDownload}
              className="p-3 rounded-xl transition-colors"
              style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}
              title="Download JSON report">
              <Download size={16} style={{ color: 'var(--teal)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-2xl p-8 flex flex-col items-center gap-4"
          style={{ background: 'var(--card)', border: '1px solid rgba(0,212,232,0.2)' }}>
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
              style={{ borderTopColor: 'var(--cyan)', animationDuration: '0.8s' }} />
            <div className="absolute inset-2 rounded-full border-4 border-transparent animate-spin"
              style={{
                borderTopColor: 'var(--lavender)', animationDuration: '1.4s',
                animationDirection: 'reverse'
              }} />
          </div>
          <p className="font-mono text-sm" style={{ color: 'var(--cyan)' }}>{step}</p>
          <p className="text-xs opacity-40">Processing {files.length} CT slice{files.length > 1 ? 's' : ''}…</p>
        </div>
      )}

      {/* Results */}
      {result && <ResultsPanel result={result} />}
    </div>
  )
}
