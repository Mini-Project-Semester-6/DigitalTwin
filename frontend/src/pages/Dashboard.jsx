import { Link } from 'react-router-dom'
import {
  IconScan, IconBrain, IconGitBranch, IconCpu,
  IconArrowRight, IconVirus, IconLungs,
  IconCircleDot, IconActivity
} from '@tabler/icons-react'

const FEATURES = [
  { Icon: IconScan,      title: '3D CNN Encoder',    accent: 'var(--cyan)',    body: 'EfficientNet-B0/B2 backbone processes stacked CT slices in a tri-channel tensor, extracting rich spatial features from lung parenchyma.' },
  { Icon: IconLungs,     title: '3-D Mesh Reconstruction', accent: 'var(--lavender)', body: 'Geometric features from volumetric segmentation approximate Marching Cubes mesh statistics including HD95 and surface-to-volume ratio.' },
  { Icon: IconGitBranch, title: 'Temporal LSTM',        accent: 'var(--amber)',   body: '3-layer LSTM with multi-head attention simulates disease trajectory, projecting 7 future severity states from the patient latent embedding.' },
  { Icon: IconCpu,       title: 'Digital Twin State',   accent: 'var(--teal)',    body: 'A 256-dimensional latent space encodes each patient as a unique digital representation, enabling CT slice reconstruction via the decoder.' },
]

const STATS = [
  { value: '95.8%',  label: 'COVID-19 Accuracy',   color: 'var(--cyan)'    },
  { value: '0.956',  label: 'AUC-ROC (COVID)',      color: 'var(--teal)'    },
  { value: '0.958',  label: 'Precision',       color: 'var(--lavender)'},
  { value: '0.968',  label: 'Recall',  color: 'var(--amber)'   },
]

const PIPELINE = ['CT Scan (PNG/DICOM)', '3D CNN Encoder', '3D Reconstruction', 'Digital Twin Latent', 'Temporal LSTM', 'Predictions & Projections']

export default function Dashboard() {
  return (
    <div className="row g-4">

      {/* ── Hero card ────────────────────────────────────────────────── */}
      <div className="col-12">
        <div className="card border-0"
             style={{ background: 'linear-gradient(135deg, #0F1F35 0%, #132840 100%)',
                      borderLeft: '4px solid var(--cyan) !important' }}>
          <div className="card-body p-4 d-flex flex-column flex-md-row align-items-start align-items-md-center gap-4">
            <div className="flex-1">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="badge" style={{ background:'rgba(0,212,232,0.15)', color:'var(--cyan)', border:'1px solid rgba(0,212,232,0.3)' }}>
                  <IconCircleDot size={10} className="me-1" />
                  Lung Digital Twin Platform
                </span>
              </div>
              <h1 className="h2 fw-bold mb-2" style={{ color: 'var(--white)', fontFamily:'"Space Grotesk",system-ui' }}>
                Predict. Reconstruct.{' '}
                <span className="glow-cyan" style={{ color: 'var(--cyan)' }}>Simulate.</span>
              </h1>
              <p className="text-muted mb-3">
                Upload CT scan slices and let the digital twin classify COVID-19 variants,
                reconstruct 3-D lung geometry, and project future disease states.
              </p>
              <Link to="/analyze" className="btn btn-primary d-inline-flex align-items-center gap-2">
                Start Analysis <IconArrowRight size={16} />
              </Link>
            </div>
            <div className="d-none d-md-flex align-items-center justify-content-center rounded-3 p-3"
                 style={{ background:'rgba(0,212,232,0.08)', border:'1px solid rgba(0,212,232,0.2)', minWidth:120 }}>
              <IconLungs size={64} color="var(--cyan)" stroke={1} style={{ opacity:.7 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────── */}
      {STATS.map(({ value, label, color }) => (
        <div key={label} className="col-6 col-md-3">
          <div className="card h-100">
            <div className="card-body text-center p-3">
              <div className="h2 fw-bold mb-1" style={{ color, fontFamily:'"Space Grotesk",system-ui' }}>{value}</div>
              <div className="small" style={{ color:'var(--tblr-muted)' }}>{label}</div>
            </div>
          </div>
        </div>
      ))}

      {/* ── Pipeline flow ─────────────────────────────────────────────── */}
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ color:'var(--tblr-muted)', fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Model Pipeline
            </h3>
          </div>
          <div className="card-body">
            <div className="d-flex flex-wrap align-items-center gap-2">
              {PIPELINE.map((step, i) => (
                <div key={i} className="d-flex align-items-center gap-2">
                  <span className="badge"
                        style={{ background:'var(--tblr-bg-surface-secondary)', color:'var(--cyan)',
                                 border:'1px solid var(--rim)', fontFamily:'"JetBrains Mono",monospace',
                                 fontSize:'.75rem', padding:'.4em .7em' }}>
                    {step}
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <IconArrowRight size={12} color="var(--tblr-muted)" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Feature cards ─────────────────────────────────────────────── */}
      {FEATURES.map(({ Icon, title, body, accent }) => (
        <div key={title} className="col-12 col-md-6">
          <div className="card h-100" style={{ borderLeft: `3px solid ${accent}` }}>
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="rounded-2 p-2" style={{ background:`${accent}18` }}>
                  <Icon size={20} color={accent} stroke={1.5} />
                </div>
                <h3 className="card-title mb-0 fw-semibold" style={{ color:'var(--tblr-body-color)' }}>{title}</h3>
              </div>
              <p className="card-text" style={{ color:'var(--tblr-muted)', fontSize:'.875rem', lineHeight:1.6 }}>{body}</p>
            </div>
          </div>
        </div>
      ))}

      {/* ── Outputs grid ──────────────────────────────────────────────── */}
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ color:'var(--tblr-muted)', fontSize:'.75rem', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Model Outputs
            </h3>
          </div>
          <div className="card-body">
            <div className="row g-2">
              {[
                ['COVID Variant','COVID-Neg / COVID-Pos','var(--teal)'],
                ['Severity','Continuous [0,1] score','var(--coral)'],
                ['CT Recon','64×64 latent reconstruction','var(--amber)'],
                ['95% CI','Prediction interval','var(--lavender)'],
                ['Risk Score','AUC-ROC-based [0,1]','var(--amber)'],
                ['Progression','7-step LSTM simulation','var(--cyan)'],
                ['3D Mesh','Vol · Surface · HD95','var(--teal)'],
              ].map(([label, desc, color]) => (
                <div key={label} className="col-6 col-md-3 col-lg-2">
                  <div className="p-2 rounded-2" style={{ background:'var(--tblr-bg-surface-secondary)', border:`1px solid ${color}33` }}>
                    <div className="fw-semibold mb-1" style={{ fontSize:'.75rem', color, fontFamily:'"JetBrains Mono",monospace' }}>{label}</div>
                    <div style={{ fontSize:'.7rem', color:'var(--tblr-muted)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

