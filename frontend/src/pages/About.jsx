import { useEffect, useState } from 'react'
import { getModelInfo } from '../utils/api'
import { Cpu, CheckCircle, AlertCircle } from 'lucide-react'
import {
  IconFlask, IconTrash, IconDownload, IconLoader2
} from '@tabler/icons-react'

export default function About() {
  const [info, setInfo] = useState(null)
  const [err,  setErr]  = useState(false)

  useEffect(() => {
    getModelInfo().then(setInfo).catch(() => setErr(true))
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <section className="space-y-2">
        <h1 className="font-display font-700 text-3xl tracking-tight">About Lung Digital Twin</h1>
        <p className="opacity-55 leading-relaxed">
          LungTwin is a full-stack COVID-19 diagnostic assistant powered by a Lung Digital Twin model —
          an AI system that encodes patient CT scans into a latent 3-D representation for variant
          classification, severity scoring, geometric analysis, and disease trajectory simulation.
        </p>
      </section>

      {/* Architecture */}
      <section className="space-y-4">
        <h2 className="font-display font-600 text-xl">Architecture</h2>
        <div className="space-y-3">
          {[
            {
              title: '3D CNN Encoder (EfficientNet-B0)',
              desc: 'Three adjacent CT slices are stacked into a 3-channel 224×224 tensor and passed through an EfficientNet-B0 backbone (1280-d features) projected to 512 dimensions.',
              accent: 'var(--cyan)',
            },
            {
              title: 'Geometric Feature Encoder',
              desc: 'Ten volumetric statistics (mean intensity, std, lung fraction, edge density, skewness, etc.) are encoded by a 2-layer MLP with LayerNorm into a 256-d geometric embedding.',
              accent: 'var(--lavender)',
            },
            {
              title: 'Fusion + Temporal LSTM',
              desc: 'Image (512-d) and geometric (256-d) embeddings are fused into a 256-d latent state, then expanded into a pseudo-sequence and passed through a 2-layer attention-LSTM.',
              accent: 'var(--amber)',
            },
            {
              title: 'Prediction Heads',
              desc: 'Three independent heads: classifier (2-class: COVID19 / Non-COVID19), severity regressor [0,1], and confidence estimator.',
              accent: 'var(--teal)',
            },
            {
              title: 'Progression LSTM',
              desc: '3-layer LSTM with multi-head (3-head) attention rolls the 256-d latent state forward 7 time-steps, outputting next-state vectors and future severity scores.',
              accent: 'var(--coral)',
            },
            {
              title: 'CT Decoder',
              desc: '256-d latent → 1024 FC → reshape (64, 4, 4) → 4× ConvTranspose2d stages → 64×64 greyscale reconstruction of the CT slice distribution.',
              accent: 'var(--cyan)',
            },
          ].map(({ title, desc, accent }) => (
            <div key={title} className="p-5 rounded-xl"
                 style={{ background: 'var(--card)', border: `1px solid ${accent}33` }}>
              <p className="font-display font-600 text-sm mb-1" style={{ color: accent }}>{title}</p>
              <p className="text-sm opacity-55 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live model info from API */}
      <section className="space-y-4">
        <h2 className="font-display font-600 text-xl flex items-center gap-2">
          <Cpu size={18} style={{ color: 'var(--cyan)' }} />
          Loaded Models
        </h2>
        {err && (
          <div className="flex items-center gap-2 text-sm p-4 rounded-xl"
               style={{ background: 'rgba(255,92,92,0.1)', border: '1px solid rgba(255,92,92,0.3)',
                        color: 'var(--coral)' }}>
            <AlertCircle size={16} />
            Backend not reachable — start the FastAPI server on port 8000.
          </div>
        )}
        {info && info.models.map(m => (
          <div key={m.name} className="p-5 rounded-xl flex items-start gap-4"
               style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
            <CheckCircle size={18} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
            <div className="space-y-1">
              <p className="font-display font-600 text-sm">{m.name}</p>
              <p className="text-xs font-mono opacity-40">{m.file}</p>
              <p className="text-xs opacity-55">
                {Object.entries(m)
                  .filter(([k]) => !['name','file'].includes(k))
                  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                  .join(' · ')}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Disclaimer */}
      <section className="p-5 rounded-xl text-sm opacity-50 leading-relaxed"
               style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
        <strong className="opacity-100">Disclaimer.</strong>{' '}
        This tool is for research and educational purposes only.
        It is not a certified medical device and should not be used for clinical diagnosis.
        Always consult a qualified radiologist or physician.
      </section>
    </div>
  )
}
