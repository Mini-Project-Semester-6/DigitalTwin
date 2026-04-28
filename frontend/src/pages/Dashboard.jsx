import { useNavigate } from 'react-router-dom'
import { Upload, Activity, TrendingUp, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function Dashboard() {
  const navigate  = useNavigate()
  const [analyses, setAnalyses] = useState({})

  useEffect(() => {
    setAnalyses(api.getAllAnalyses())
  }, [])

  const all    = Object.values(analyses)
  const high   = all.filter(a => a.prediction?.risk_level === 'HIGH').length
  const medium = all.filter(a => a.prediction?.risk_level === 'MEDIUM').length
  const low    = all.filter(a => a.prediction?.risk_level === 'LOW').length
  const recent = all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Hero */}
      <div className="panel corner-accent p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'radial-gradient(circle at 70% 50%, var(--accent) 0%, transparent 60%)',
          }} />
        <div className="relative z-10">
          <div className="label-tag mb-2">Digital Twin Platform</div>
          <h1 className="font-display text-4xl font-bold text-black mb-2">
            Lung CT Analysis<br />
            <span className="text-accent text-glow">Digital Twin</span>
          </h1>
          <p className="text-dim text-sm max-w-lg mt-3 leading-relaxed">
            Upload CT scan masks to generate a 3D digital twin. The model extracts
            16 geometric features, runs a 3D CNN (FP16) and GNN classifier, then
            projects nodule progression over 4.5 years.
          </p>
          <div className="flex gap-3 mt-6">
            <button onClick={() => navigate('/upload')} className="btn-neon">
              <span>+ Upload New Scan</span>
            </button>
            {all.length > 0 && (
              <button onClick={() => navigate('/history')} className="btn-neon" style={{ borderColor: 'var(--dim)', color: 'var(--dim)' }}>
                <span>View History</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Scans',   value: all.length,  color: 'var(--accent)', icon: Activity },
          { label: 'High Risk',     value: high,         color: 'var(--pulse)',  icon: AlertTriangle },
          { label: 'Medium Risk',   value: medium,       color: 'var(--warn)',   icon: TrendingUp },
          { label: 'Low Risk',      value: low,          color: 'var(--safe)',   icon: CheckCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="panel p-5 corner-accent group hover:border-opacity-60 transition-all">
            <div className="flex items-start justify-between mb-3">
              <span className="label-tag">{label}</span>
              <Icon size={14} style={{ color }} />
            </div>
            <div className="font-display text-4xl font-bold" style={{ color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline overview */}
      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-6">
          <div className="label-tag mb-4">Model Pipeline</div>
          <div className="space-y-3">
            {[
              { step: '01', name: 'Load & Resample',   detail: 'MHD → 2mm isotropic binary mask' },
              { step: '02', name: 'Marching Cubes',    detail: '3D mesh reconstruction from mask' },
              { step: '03', name: 'Geometric Features', detail: '16 shape descriptors (volume, sphericity…)' },
              { step: '04', name: '3D CNN Patches',    detail: '32³ patches · FP16 · Tiny3DCNN' },
              { step: '05', name: 'GNN Classifier',    detail: 'k-NN graph (k=5) · 2-layer GCN' },
              { step: '06', name: 'Feature Fusion',    detail: 'Geometric + CNN → Risk score' },
            ].map(({ step, name, detail }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="mono text-xs" style={{ color: 'var(--accent)', minWidth: '1.8rem' }}>{step}</span>
                <div>
                  <div className="text-sm text-black font-medium">{name}</div>
                  <div className="label-tag mt-0.5">{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <div className="label-tag mb-4">Recent Analyses</div>
          {recent.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-10">
              <div className="w-12 h-12 border border-dashed border-dim flex items-center justify-center">
                <Upload size={20} className="text-dim" />
              </div>
              <p className="text-dim text-sm text-center">No scans analysed yet.<br />Upload a CT scan to begin.</p>
              <button onClick={() => navigate('/upload')} className="btn-neon mt-2">
                <span>Upload First Scan</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map(a => (
                <div
                  key={a.scanId}
                  onClick={() => navigate(`/analysis/${a.scanId}`)}
                  className="flex items-center justify-between p-3 rounded cursor-pointer hover:bg-white/5 transition-colors group"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-3">
                    <RiskDot level={a.prediction?.risk_level} />
                    <div>
                      <div className="text-sm text-black truncate max-w-[180px]">
                        {a.fileName}
                      </div>
                      <div className="label-tag">
                        {new Date(a.timestamp).toLocaleDateString()} · {a.prediction?.risk_level}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-dim group-hover:text-accent transition-colors" />
                </div>
              ))}
              {all.length > 5 && (
                <button onClick={() => navigate('/history')}
                  className="w-full text-center label-tag hover:text-accent transition-colors py-2">
                  View all {all.length} scans →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RiskDot({ level }) {
  const color = level === 'HIGH' ? 'var(--pulse)' : level === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'
  return (
    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
  )
}
