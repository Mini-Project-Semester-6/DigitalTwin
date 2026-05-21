import { useEffect, useState } from 'react'
import { Database, Play, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchSamples, runSamplePrediction } from '../utils/api'
import toast from 'react-hot-toast'

const CONDITION_COLORS = {
  covid19:  'var(--cyan)',
  cancer:   'var(--coral)',
  fibrosis: 'var(--lavender)',
  nodules:  'var(--teal)',
}

const CONDITION_LABELS = {
  covid19:  'COVID-19',
  cancer:   'Lung Cancer',
  fibrosis: 'Pulmonary Fibrosis',
  nodules:  'Nodule Detection',
}

export default function SampleScans({ onResult, currentCondition }) {
  const [samples,  setSamples]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [running,  setRunning]  = useState(null)   // scan_id being run
  const [expanded, setExpanded] = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    fetchSamples()
      .then(d => setSamples(d.samples || []))
      .catch(() => setError('Sample database unavailable'))
      .finally(() => setLoading(false))
  }, [])

  const handleRun = async (scan) => {
    setRunning(scan._id)
    try {
      const result = await runSamplePrediction(
        scan._id,
        currentCondition,         
        scan.metadata || {}
      )
      onResult({ ...result, condition: currentCondition })
      toast.success(`Sample analysis complete — ${scan.title}`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Sample inference failed')
    } finally {
      setRunning(null)
    }
  }

  if (error) return null   // silently hide if Atlas unavailable

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

      {/* Header — collapsible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3 transition-colors"
        style={{ background: 'var(--panel)' }}>
        <div className="flex items-center gap-2">
          <Database size={16} style={{ color: 'var(--teal)' }} />
          <span className="font-display font-600 text-sm" style={{ color: 'var(--teal)' }}>
            Sample CT Scans
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: 'rgba(0,184,159,0.15)', color: 'var(--teal)' }}>
            MongoDB Atlas
          </span>
          {samples.length > 0 && (
            <span className="text-xs font-mono opacity-50">
              {samples.length} samples available
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp size={14} style={{ color: 'var(--teal)' }} />
          : <ChevronDown size={14} style={{ color: 'var(--teal)' }} />
        }
      </button>

      {/* Body */}
      {expanded && (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 opacity-50">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm font-mono">Loading samples from Atlas…</span>
            </div>
          ) : samples.length === 0 ? (
            <p className="text-sm opacity-40 text-center py-4">
              No sample scans found in the database.
            </p>
          ) : (
            <>
              <p className="text-xs font-mono opacity-40 mb-3">
                Click Run on any sample to see the full analysis pipeline without uploading your own scans.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {samples.map(scan => {
                  const col = CONDITION_COLORS[scan.condition] || 'var(--cyan)'
                  const isRunning = running === scan._id
                  return (
                    <div key={scan._id}
                         className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
                         style={{ background: 'var(--panel)', border: `1px solid ${col}33` }}>

                      {/* Thumbnail */}
                      {scan.thumbnail && (
                        <img src={`data:image/png;base64,${scan.thumbnail}`}
                             alt=""
                             className="rounded shrink-0"
                             style={{ width: 40, height: 40, imageRendering: 'pixelated',
                                      filter: 'brightness(1.1) contrast(1.2)' }} />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                                style={{ background: `${col}22`, color: col }}>
                            {CONDITION_LABELS[scan.condition] || scan.condition}
                          </span>
                          <span className="text-xs opacity-40 font-mono">
                            {scan.slice_count} slices
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate"
                           style={{ color: 'var(--white)' }}>
                          {scan.title}
                        </p>
                        <p className="text-xs opacity-50 truncate">{scan.description}</p>
                      </div>

                      {/* Run button */}
                      <button
                        onClick={() => handleRun(scan)}
                        disabled={!!running}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-all disabled:opacity-40"
                        style={{
                          background: isRunning ? `${col}22` : `${col}18`,
                          border: `1px solid ${col}`,
                          color: col,
                        }}>
                        {isRunning
                          ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                          : <><Play size={12} /> Run</>
                        }
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}