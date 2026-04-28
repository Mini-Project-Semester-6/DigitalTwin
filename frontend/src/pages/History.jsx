import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, ChevronRight, TrendingUp, Activity, Search } from 'lucide-react'
import api from '../lib/api'

export default function History() {
  const navigate   = useNavigate()
  const [analyses, setAnalyses] = useState({})
  const [search,   setSearch]   = useState('')
  const [sortBy,   setSortBy]   = useState('date')

  useEffect(() => { setAnalyses(api.getAllAnalyses()) }, [])

  const all = Object.values(analyses)
    .filter(a => !search || a.fileName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'date')  return new Date(b.timestamp) - new Date(a.timestamp)
      if (sortBy === 'risk')  return riskNum(b.prediction?.risk_level) - riskNum(a.prediction?.risk_level)
      if (sortBy === 'prob')  return (b.prediction?.nodule_probability || 0) - (a.prediction?.nodule_probability || 0)
      return 0
    })

  const riskNum = r => r === 'HIGH' ? 3 : r === 'MEDIUM' ? 2 : 1

  const deleteAll = () => {
    if (confirm('Delete all analyses?')) {
      all.forEach(a => api.deleteAnalysis(a.scanId))
      setAnalyses({})
    }
  }

  const deleteScan = (scanId, e) => {
    e.stopPropagation()
    api.deleteAnalysis(scanId)
    setAnalyses(api.getAllAnalyses())
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <div className="label-tag mb-1">Scan Archive</div>
          <h2 className="font-display text-2xl font-bold text-black">History</h2>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/upload')} className="btn-neon">
            <span>+ New Scan</span>
          </button>
          {all.length > 0 && (
            <button onClick={deleteAll} className="btn-neon btn-danger">
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {all.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total',  value: Object.keys(analyses).length, color: 'var(--accent)' },
            { label: 'High',   value: all.filter(a=>a.prediction?.risk_level==='HIGH').length,   color: 'var(--pulse)' },
            { label: 'Medium', value: all.filter(a=>a.prediction?.risk_level==='MEDIUM').length, color: 'var(--warn)' },
            { label: 'Low',    value: all.filter(a=>a.prediction?.risk_level==='LOW').length,    color: 'var(--safe)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="panel p-3 flex items-center justify-between">
              <span className="label-tag">{label}</span>
              <span className="font-display text-xl font-bold" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + sort */}
      {all.length > 0 && (
        <div className="flex gap-3">
          <div className="flex-1 panel flex items-center gap-2 px-3 py-2">
            <Search size={13} className="text-dim" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scans..."
              className="bg-transparent text-sm text-black placeholder-dim outline-none flex-1 mono"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="panel px-3 py-2 text-xs mono text-dim outline-none"
            style={{ background: 'var(--panel)' }}
          >
            <option value="date">Sort: Date</option>
            <option value="risk">Sort: Risk Level</option>
            <option value="prob">Sort: Probability</option>
          </select>
        </div>
      )}

      {/* List */}
      {all.length === 0 ? (
        <div className="panel p-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 border border-dashed border-dim flex items-center justify-center">
            <Activity size={28} className="text-dim" />
          </div>
          <div>
            <div className="text-black font-medium">No scans in history</div>
            <div className="text-dim text-sm mt-1">Upload a CT scan to get started</div>
          </div>
          <button onClick={() => navigate('/upload')} className="btn-neon mt-2">
            <span>Upload First Scan</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {all.map(a => (
            <ScanRow
              key={a.scanId}
              analysis={a}
              onClick={() => navigate(`/analysis/${a.scanId}`)}
              onProjections={() => navigate(`/projections/${a.scanId}`)}
              onDelete={(e) => deleteScan(a.scanId, e)}
            />
          ))}
          {all.length === 0 && search && (
            <div className="text-center text-dim py-8 text-sm">No scans match "{search}"</div>
          )}
        </div>
      )}
    </div>
  )
}

function ScanRow({ analysis, onClick, onProjections, onDelete }) {
  const { prediction, geometry, fileName, timestamp, findings } = analysis
  const riskColor = prediction?.risk_level === 'HIGH'   ? 'var(--pulse)' :
                    prediction?.risk_level === 'MEDIUM' ? 'var(--warn)'  : 'var(--safe)'

  return (
    <div
      className="panel p-4 cursor-pointer hover:border-opacity-60 transition-all group"
      style={{ borderColor: `${riskColor}20` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* Risk indicator */}
        <div className="flex-shrink-0 w-1 self-stretch rounded-full"
          style={{ background: riskColor, boxShadow: `0 0 8px ${riskColor}` }} />

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-black font-medium truncate">{fileName}</span>
            <span className="mono text-xs px-2 py-0.5 flex-shrink-0"
              style={{ color: riskColor, border: `1px solid ${riskColor}40` }}>
              {prediction?.risk_level}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="label-tag">{new Date(timestamp).toLocaleString()}</span>
            <span className="label-tag">{findings?.length || 0} findings</span>
            <span className="label-tag">Vol: {geometry?.volume_mm3?.toLocaleString()} mm³</span>
          </div>
        </div>

        {/* Probability bar */}
        <div className="w-32 hidden sm:block">
          <div className="flex justify-between mb-1">
            <span className="label-tag">Prob.</span>
            <span className="mono text-xs" style={{ color: riskColor }}>
              {((prediction?.nodule_probability || 0) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill"
              style={{
                width: `${(prediction?.nodule_probability || 0) * 100}%`,
                background: `linear-gradient(90deg, ${riskColor}, ${riskColor}60)`,
              }} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onProjections() }}
            className="mono text-xs px-2 py-1 border border-border text-dim hover:border-accent hover:text-accent transition-colors"
          >
            <TrendingUp size={11} />
          </button>
          <button
            onClick={onDelete}
            className="mono text-xs px-2 py-1 border border-border text-dim hover:border-pulse hover:text-pulse transition-colors"
          >
            <Trash2 size={11} />
          </button>
          <ChevronRight size={14} className="text-dim group-hover:text-accent transition-colors" />
        </div>
      </div>
    </div>
  )
}
