import { Link } from 'react-router-dom'
import { Scan, Layers, GitBranch, Cpu, ArrowRight } from 'lucide-react'

const FEATURES = [
  {
    Icon: Scan,
    title: '2.5D CNN Encoder',
    body: 'EfficientNet-B0 backbone processes stacked CT slices in a tri-channel tensor, extracting rich spatial features from lung parenchyma.',
    accent: 'var(--cyan)',
  },
  {
    Icon: Layers,
    title: '3-D Mesh Reconstruction',
    body: 'Geometric features are derived from volumetric segmentation to approximate Marching Cubes mesh statistics including HD95 and surface-to-volume ratio.',
    accent: 'var(--lavender)',
  },
  {
    Icon: GitBranch,
    title: 'Temporal LSTM',
    body: '3-layer LSTM with multi-head self-attention simulates disease trajectory, projecting future severity states from the patient latent embedding.',
    accent: 'var(--amber)',
  },
  {
    Icon: Cpu,
    title: 'Digital Twin State',
    body: 'A 256-dimensional latent space encodes each patient as a unique digital representation, enabling CT slice reconstruction via the decoder.',
    accent: 'var(--teal)',
  },
]

const PIPELINE = [
  'CT Scan (PNG slices)',
  '2.5D CNN Encoder',
  '3D Reconstruction',
  'Latent Embedding',
  'Digital Twin Latent',
  'Temporal LSTM',
  'Predictions & Projections',
]

export default function Dashboard() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">

      {/* Hero */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono"
          style={{
            background: 'rgba(0,212,232,0.1)', border: '1px solid rgba(0,212,232,0.3)',
            color: 'var(--cyan)'
          }}>
          <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
          Lung Digital Twin · COVID-19 AI
        </div>

        <h1 className="font-display font-700 text-5xl leading-tight tracking-tight">
          Predict. Reconstruct.{' '}
          <span className="glow-cyan" style={{ color: 'var(--cyan)' }}>Simulate.</span>
        </h1>

        <p className="text-lg opacity-60 max-w-xl mx-auto leading-relaxed">
          Upload CT scan slices and let the digital twin classify COVID-19 variants,
          score severity, reconstruct 3-D lung geometry, and project future disease states.
        </p>

        <Link to="/analyze"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-display font-600 text-sm transition-all duration-200"
          style={{ background: 'var(--cyan)', color: 'var(--deep)' }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 24px rgba(0,212,232,0.4)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
          Start Analysis
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Pipeline */}
      <section className="space-y-4">
        <h2 className="font-display font-600 text-lg opacity-70">Model Pipeline</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="px-4 py-2 rounded-xl text-sm font-mono"
                style={{
                  background: 'var(--card)', border: '1px solid var(--rim)',
                  color: 'var(--cyan)'
                }}>
                {step}
              </div>
              {i < PIPELINE.length - 1 && (
                <ArrowRight size={14} className="opacity-30" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {FEATURES.map(({ Icon, title, body, accent }) => (
          <div key={title} className="p-6 rounded-2xl space-y-3 transition-all duration-300"
            style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 24px ${accent}18`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: `${accent}18` }}>
                <Icon size={18} style={{ color: accent }} />
              </div>
              <h3 className="font-display font-600 text-base">{title}</h3>
            </div>
            <p className="text-sm leading-relaxed opacity-55">{body}</p>
          </div>
        ))}
      </section>

      {/* Outputs */}
      <section className="rounded-2xl p-8 space-y-5"
        style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
        <h2 className="font-display font-600 text-lg">Model Outputs</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            // ['Variant', 'COVID-Negative / COVID-Positive', 'var(--teal)'],
            // ['Severity', 'Continuous [0, 1] score', 'var(--coral)'],
            // ['Confidence', 'Epistemic uncertainty', 'var(--lavender)'],
            // ['3D Mesh', 'Vol · Surface · HD95', 'var(--cyan)'],
            // ['CT Recon', '64×64 latent reconstruction', 'var(--amber)'],
            // ['Progression', '7-step future simulation', 'var(--cyan)'],
            ['COVID Variant', 'COVID-Neg / COVID-Pos', 'var(--teal)'],
            ['Severity', 'Continuous [0,1] score', 'var(--coral)'],
            ['CT Reconstruction', '64×64 latent reconstruction', 'var(--amber)'],
            // Cancer
            ['Cancer Type', 'Adeno / SCC / SCLC / Normal', 'var(--cyan)'],
            ['Tumour Severity', 'Regression score', 'var(--lavender)'],
            // Fibrosis
            ['FVC', 'Forced vital capacity (mL)', 'var(--teal)'],
            ['95% CI', 'Prediction interval', 'var(--lavender)'],
            ['Fibrosis Stage', 'Mild / Moderate / Severe', 'var(--coral)'],
            ['Risk Score', 'AUC-ROC-based [0,1]', 'var(--amber)'],
            // Nodule Detection section
            ['Nodule Label', 'Benign / Malignant', 'var(--teal)'],
            ['Seg MIP', '128³ U-Net probability map', 'var(--cyan)'],
            ['Candidates', 'Centroid · volume · peak prob', 'var(--lavender)'],
            ['Growth Trajectory', '6-step LSTM malignancy rollout', 'var(--amber)'],
            // Shared
            ['Progression', '7-step LSTM simulation', 'var(--cyan)'],
            ['3D Mesh', 'Vol · Surface · HD95', 'var(--teal)'],
            ['COPD', 'Coming soon', 'var(--rim)'],
          ].map(([label, desc, color]) => (
            <div key={label} className="p-3 rounded-xl"
              style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
              <p className="font-mono text-xs font-500 mb-1" style={{ color }}>{label}</p>
              <p className="text-xs opacity-50">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
