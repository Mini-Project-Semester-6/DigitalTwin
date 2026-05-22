import { useState } from 'react'
import toast from 'react-hot-toast'
import { Download, RefreshCw, Clock } from 'lucide-react'
import { IconLoader2, IconTrash } from '@tabler/icons-react'
import CTUploader from '../components/CTUploader'
import ResultsPanel from '../components/ResultsPanel'
import SampleScans from '../components/SampleScans'
import CTViewer3D from '../components/CTViewer3D'
import { useResultsStore } from '../hooks/useResultsStore'
import {
  runPrediction, runCancerPrediction,
  runFibrosisPrediction, runNodulePrediction,
} from '../utils/api'

function fmtAge(ms) {
  if (!ms) return null
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const CONDITION_META = {
  covid19:  { label: 'COVID-19',          color: 'var(--cyan)'     },
  cancer:   { label: 'Lung Cancer',        color: 'var(--coral)'    },
  fibrosis: { label: 'Pulmonary Fibrosis', color: 'var(--lavender)' },
}

const STEPS = [
  'Preprocessing CT slices…',
  'Running EfficientNet encoder…',
  'Computing geometric features…',
  'Digital Twin forward pass…',
  'Simulating disease progression…',
  'Decoding latent state…',
]

export default function Analyze() {
  const { results, setResult, clearResult } = useResultsStore()

  const [files, setFiles]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [condition, setCondition] = useState('covid19')
  const [step, setStep]           = useState('')
  const [fibrosisMeta, setFibrosisMeta] = useState({
    age: 65, sex: 'Male', smoking_status: 'Ex-smoker',
    baseline_fvc: 2600, weeks: 0,
  })

  const cachedResult = results[condition] ?? null
  const isFromCache  = !!cachedResult && !loading

  const handleSampleResult = (data) => {
    if (data.condition) setCondition(data.condition)
    setResult(data.condition || condition, data)
  }

  const handleRun = async () => {
    if (!files.length) { toast.error('Please upload at least one CT slice.'); return }
    setLoading(true)
    let si = 0; setStep(STEPS[0])
    const interval = setInterval(() => { si = (si + 1) % STEPS.length; setStep(STEPS[si]) }, 900)
    try {
      let data
      if (condition === 'cancer')        data = await runCancerPrediction(files)
      else if (condition === 'fibrosis') data = await runFibrosisPrediction(files, fibrosisMeta)
      else if (condition === 'nodules')  data = await runNodulePrediction(files)
      else                               data = await runPrediction(files)
      setResult(condition, data)
      toast.success('Analysis complete')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Server error')
    } finally {
      clearInterval(interval); setStep(''); setLoading(false)
    }
  }

  const handleRerun = () => { clearResult(condition); handleRun() }

  const handleReset = () => { setFiles([]); clearResult(condition) }

  const handleDownload = () => {
    if (!cachedResult) return
    const blob = new Blob([JSON.stringify(cachedResult, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), {
      href: url, download: `lung-twin-${condition}-${Date.now()}.json`
    }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="font-display font-700 text-3xl tracking-tight">CT Scan Analysis</h1>
        <p className="text-sm opacity-50 mt-1">Upload one or more PNG / JPEG CT slices</p>
      </div>

      <div className="rounded-2xl p-6 space-y-5"
        style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

        {/* Condition tabs */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(CONDITION_META).map(([id, { label, color }]) => {
            const hasCache = !!results[id]
            return (
              <button key={id} onClick={() => setCondition(id)}
                className="relative px-4 py-2 rounded-xl text-sm font-mono transition-all duration-200"
                style={{
                  background: condition === id ? `${color}22` : 'var(--panel)',
                  border: `1px solid ${condition === id ? color : 'var(--rim)'}`,
                  color: condition === id ? color : '#7a94b0',
                }}>
                {label}
                {hasCache && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                    style={{ background: 'var(--teal)', boxShadow: '0 0 6px var(--teal)' }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Cache notice */}
        {isFromCache && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-mono"
            style={{ background: 'rgba(0,212,232,0.08)', border: '1px solid rgba(0,212,232,0.2)' }}>
            <Clock size={13} style={{ color: 'var(--teal)' }} />
            <span style={{ color: 'var(--teal)' }}>
              Showing cached result from {fmtAge(cachedResult._savedAt)} — no need to re-upload
            </span>
            <button onClick={handleRerun} disabled={!files.length}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ border: '1px solid rgba(0,212,232,0.3)', color: 'var(--cyan)' }}>
              <RefreshCw size={11} /> Re-run
            </button>
          </div>
        )}

        <SampleScans onResult={handleSampleResult} currentCondition={condition} />

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--rim)' }} />
          <span className="text-xs font-mono opacity-40">or upload your own</span>
          <div className="flex-1 h-px" style={{ background: 'var(--rim)' }} />
        </div>

        <CTUploader files={files} setFiles={setFiles} />

        {files.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
            <div className="mb-3">
              <h2 className="font-display text-lg">3D CT Viewer</h2>
              <p className="text-xs opacity-50">Interactive visualization of uploaded CT slices</p>
            </div>
            <CTViewer3D files={files} />
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-3">
          <button onClick={handleRun}
            disabled={loading || !files.length}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-display font-600 text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: loading || !files.length ? 'var(--rim)' : 'var(--cyan)',
              color:      loading || !files.length ? '#7a94b0'    : 'var(--deep)',
            }}>
            {loading
              ? <><IconLoader2 className="animate-spin" size={16} stroke={1.5} />{step}</>
              : <>Run Digital Twin Analysis</>}
          </button>

          {(files.length > 0 || cachedResult) && (
            <button onClick={handleReset}
              className="p-3 rounded-xl transition-colors"
              style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}
              title="Clear files and cached result">
              <IconTrash size={16} stroke={1.5} />
            </button>
          )}

          {cachedResult && (
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
              style={{ borderTopColor: 'var(--lavender)', animationDuration: '1.4s', animationDirection: 'reverse' }} />
          </div>
          <p className="font-mono text-sm" style={{ color: 'var(--cyan)' }}>{step}</p>
          <p className="text-xs opacity-40">Processing {files.length} CT slice{files.length > 1 ? 's' : ''}…</p>
        </div>
      )}

      {!loading && cachedResult && <ResultsPanel result={cachedResult} />}
    </div>
  )
}
