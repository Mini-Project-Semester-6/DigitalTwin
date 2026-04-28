import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle, CheckCircle, Info, ChevronRight, Box } from 'lucide-react'
import api from '../lib/api'
import CTViewer from '../components/CTViewer'

const RISK_CONFIG = {
  HIGH:   { color: 'var(--pulse)', glow: 'glow-pulse', icon: AlertTriangle, label: 'High Risk'   },
  MEDIUM: { color: 'var(--warn)',  glow: '',            icon: TrendingUp,    label: 'Medium Risk' },
  LOW:    { color: 'var(--safe)',  glow: 'glow-safe',   icon: CheckCircle,   label: 'Low Risk'    },
}

export default function Analysis() {
  const { scanId }  = useParams()
  const navigate    = useNavigate()
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    const a = api.getAnalysis(scanId)
    if (!a) navigate('/')
    else setAnalysis(a)
  }, [scanId, navigate])

  if (!analysis) return null

  const { prediction, geometry, findings, mesh, fileName, timestamp } = analysis
  const risk    = RISK_CONFIG[prediction.risk_level]
  const RiskIcon = risk.icon

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header bar */}
      <div className="flex items-start justify-between">
        <div>
          <div className="label-tag mb-1">Scan Analysis</div>
          <h2 className="font-display text-2xl font-bold text-black">{fileName}</h2>
          <div className="label-tag mt-1">{new Date(timestamp).toLocaleString()}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/projections/${scanId}`)} className="btn-neon">
            <span>Future Projections →</span>
          </button>
          <button onClick={() => navigate('/upload')} className="btn-neon"
            style={{ borderColor: 'var(--dim)', color: 'var(--dim)' }}>
            <span>New Scan</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* LEFT: CT viewer + risk */}
        <div className="space-y-4">
          <CTViewer analysis={analysis} />

          {/* Risk card */}
          <div className={`panel p-5 corner-accent`}
            style={{ borderColor: `${risk.color}40` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 border flex items-center justify-center"
                style={{ borderColor: risk.color }}>
                <RiskIcon size={18} style={{ color: risk.color }} />
              </div>
              <div>
                <div className="font-display text-lg font-bold" style={{ color: risk.color }}>
                  {risk.label}
                </div>
                <div className="label-tag">Digital Twin Assessment</div>
              </div>
            </div>

            <ProbabilityMeter
              value={prediction.nodule_probability}
              label="Nodule Probability"
              color={risk.color}
            />
            <ProbabilityMeter
              value={prediction.malignancy_score}
              label="Malignancy Score"
              color={risk.color}
              className="mt-3"
            />

            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-y-2">
              <Stat label="Confidence"    value={`${(prediction.confidence * 100).toFixed(0)}%`} />
              <Stat label="CNN Emb. Norm" value={prediction.cnn_embedding_norm} />
              <Stat label="GNN Score"     value={prediction.gnn_node_score} />
              <Stat label="Risk Level"    value={prediction.risk_level} color={risk.color} />
            </div>
          </div>
        </div>

        {/* CENTRE: Geometric features */}
        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Box size={14} className="text-accent" />
              <span className="label-tag">3D Mesh — Digital Twin Geometry</span>
            </div>
            <div className="grid grid-cols-2 gap-y-3">
              {[
                { label: 'Volume',       value: `${geometry.volume_mm3.toLocaleString()} mm³` },
                { label: 'Surface Area', value: `${geometry.surface_area.toLocaleString()} mm²` },
                { label: 'Sphericity',   value: geometry.sphericity, bar: true },
                { label: 'Compactness',  value: geometry.compactness, bar: true },
                { label: 'Solidity',     value: geometry.solidity, bar: true },
                { label: 'Elongation',   value: geometry.elongation, bar: true },
                { label: 'Mean Curv.',   value: geometry.mean_curv },
                { label: 'Std Curv.',    value: geometry.std_curv },
                { label: 'Voxels',       value: geometry.n_voxels.toLocaleString() },
                { label: 'Extent',       value: geometry.extent, bar: true },
              ].map(({ label, value, bar }) => (
                <div key={label}>
                  <div className="label-tag">{label}</div>
                  {bar ? (
                    <div>
                      <div className="mono text-xs text-black">{typeof value === 'number' ? value.toFixed(3) : value}</div>
                      <div className="progress-bar mt-1">
                        <div className="progress-fill"
                          style={{ width: `${Math.min(100, (typeof value === 'number' ? value : 0) * 100)}%`,
                                   background: 'linear-gradient(90deg, var(--accent), rgba(0,212,255,0.3))' }} />
                      </div>
                    </div>
                  ) : (
                    <div className="mono text-xs text-black">{value}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="label-tag mb-2">Bounding Box (mm)</div>
              <div className="flex gap-3">
                {['bb_x_mm', 'bb_y_mm', 'bb_z_mm'].map((k, i) => (
                  <div key={k} className="flex-1 text-center panel p-2">
                    <div className="label-tag">{['X', 'Y', 'Z'][i]}</div>
                    <div className="mono text-sm text-black">{geometry[k]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mesh stats */}
          <div className="panel p-4">
            <div className="label-tag mb-3">Marching Cubes Mesh</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="font-display text-2xl text-accent">{(mesh.vertices / 1000).toFixed(1)}k</div>
                <div className="label-tag">Vertices</div>
              </div>
              <div className="text-center">
                <div className="font-display text-2xl text-accent">{(mesh.faces / 1000).toFixed(1)}k</div>
                <div className="label-tag">Faces</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-dim text-center">
              σ=1.0 Gaussian smooth · level=0.4·(vmax-vmin) · spacing=2mm
            </div>
          </div>
        </div>

        {/* RIGHT: Findings + model internals */}
        <div className="space-y-4">

          {/* Findings */}
          <div className="panel p-5">
            <div className="label-tag mb-3">Detected Findings ({findings.length})</div>
            {findings.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle size={32} className="text-safe mx-auto mb-2" />
                <div className="text-safe text-sm">No nodules detected</div>
                <div className="text-dim text-xs mt-1">Below detection threshold</div>
              </div>
            ) : (
              <div className="space-y-3">
                {findings.map(f => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </div>
            )}
          </div>

          {/* Model internals */}
          <div className="panel p-5">
            <div className="label-tag mb-3">Model Internals</div>
            <div className="space-y-3">
              {[
                { name: '3D CNN',  detail: 'Tiny3DCNN · 32³ patches · FP16',      score: prediction.confidence },
                { name: 'GCN',     detail: '2-layer GCN · k-NN k=5 graph',         score: prediction.gnn_node_score },
                { name: 'Fusion',  detail: 'Geometric + CNN → risk classifier',    score: prediction.nodule_probability },
              ].map(({ name, detail, score }) => (
                <div key={name}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="mono text-xs text-black">{name}</span>
                    <span className="mono text-xs text-accent">{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${score * 100}%` }} />
                  </div>
                  <div className="label-tag mt-0.5">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div className="panel p-5" style={{ borderColor: `${risk.color}40` }}>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} style={{ color: risk.color }} />
              <span className="label-tag">Clinical Recommendation</span>
            </div>
            <div className="text-sm text-black font-medium mb-2">
              {prediction.risk_level === 'HIGH'   ? 'Immediate specialist referral recommended' :
               prediction.risk_level === 'MEDIUM' ? '3-month follow-up CT recommended' :
                                                    '12-month surveillance CT recommended'}
            </div>
            <div className="text-dim text-xs leading-relaxed">
              Research model output only. Not validated for clinical use.
              Always consult a qualified radiologist.
            </div>
            <button
              onClick={() => navigate(`/projections/${scanId}`)}
              className="btn-neon mt-4 w-full flex items-center justify-center gap-2"
            >
              <span>View 4-Year Projections</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProbabilityMeter({ value, label, color, className = '' }) {
  const pct = Math.round(value * 100)
  return (
    <div className={className}>
      <div className="flex justify-between mb-1">
        <span className="label-tag">{label}</span>
        <span className="mono text-sm font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 bg-black/50 relative overflow-hidden" style={{ borderRadius: 1 }}>
        <div
          className="h-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="label-tag">{label}</div>
      <div className="mono text-xs" style={{ color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

function FindingCard({ finding }) {
  const riskColor = finding.risk === 'HIGH' ? 'var(--pulse)' :
                    finding.risk === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'
  return (
    <div className="p-3 space-y-2" style={{ border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}>
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-black font-medium">Finding #{finding.id}</div>
          <div className="label-tag">{finding.location}</div>
        </div>
        <span className="mono text-xs px-2 py-0.5" style={{ color: riskColor, border: `1px solid ${riskColor}40` }}>
          {finding.risk}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="label-tag">Type</div>
          <div className="mono text-xs text-black truncate">{finding.type}</div>
        </div>
        <div>
          <div className="label-tag">Diameter</div>
          <div className="mono text-xs text-black">{finding.diameter} mm</div>
        </div>
        <div>
          <div className="label-tag">Density</div>
          <div className="mono text-xs text-black">{finding.density}</div>
        </div>
      </div>
    </div>
  )
}
