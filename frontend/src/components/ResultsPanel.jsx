import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Tooltip as RechartTip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { Shield, AlertTriangle, Activity, Layers, Clock } from 'lucide-react'
import CTViewer3D from './CTViewer3D'

/* ── helpers ──────────────────────────────────────────────────────────────── */
const VARIANT_COLOR = { 'COVID-Negative': '#00b89f', 'COVID-Positive': '#ff5c5c' }
const VARIANT_ICON = { 'COVID-Negative': Shield, 'COVID-Positive': AlertTriangle }

function Stat({ label, value, unit = '', accent = 'var(--cyan)' }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl"
      style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
      <span className="text-xs font-mono uppercase tracking-widest opacity-40">{label}</span>
      <span className="font-display font-700 text-2xl" style={{ color: accent }}>
        {value}<span className="text-sm font-sans font-400 opacity-60 ml-1">{unit}</span>
      </span>
    </div>
  )
}

function SeverityBar({ value }) {
  const pct = Math.round(value * 100)
  const color = pct < 30 ? 'var(--teal)' : pct < 65 ? 'var(--amber)' : 'var(--coral)'
  return (
    <div>
      <div className="flex justify-between text-xs font-mono opacity-50 mb-1">
        <span>Severity Score</span><span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--rim)' }}>
        <div className="h-full rounded-full bar-animate"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/* ── Severity & Metrics card (shared across all models) ──────────────────── */
function SeverityMetricsCard({ result, accentColor = 'var(--cyan)' }) {
  const pred = result.prediction ?? {}
  const metrics = result.metrics ?? {}

  const severityVal = pred.severity_score ?? pred.severity ?? null
  const severityPct = severityVal != null ? Math.round(severityVal * 100) : null
  const sevColor = severityPct == null ? '#7a94b0'
    : severityPct < 30 ? 'var(--teal)'
      : severityPct < 65 ? 'var(--amber)'
        : 'var(--coral)'

  // collect all numeric metrics from the metrics object
  const metricRows = Object.entries(metrics).filter(([, v]) => typeof v === 'number')

  if (severityVal == null && metricRows.length === 0) return null

  return (
    <div className="rounded-2xl p-6 space-y-5 slide-up"
      style={{ background: 'var(--card)', border: `1px solid ${accentColor}33` }}>

      <div className="flex items-center gap-2">
        <Activity size={18} style={{ color: accentColor }} />
        <h3 className="font-display font-600 text-base">Severity Score & Metrics</h3>
      </div>

      {/* Severity gauge */}
      {severityVal != null && (
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-xs font-mono uppercase tracking-widest opacity-40">Severity Score</span>
            <span className="font-display font-700 text-2xl" style={{ color: sevColor }}>
              {severityPct}%
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--rim)' }}>
            <div className="h-full rounded-full bar-animate transition-all duration-700"
              style={{ width: `${severityPct}%`, background: sevColor }} />
          </div>
          <div className="flex justify-between text-xs font-mono opacity-30">
            <span>Low</span><span>Moderate</span><span>High</span>
          </div>
        </div>
      )}


    </div>
  )
}

/* ── Variant card ─────────────────────────────────────────────────────────── */
function VariantCard({ prediction }) {
  const { variant, probabilities, severity_score, confidence } = prediction
  const Icon = VARIANT_ICON[variant] || Shield
  const color = VARIANT_COLOR[variant] || 'var(--cyan)'

  const radarData = Object.entries(probabilities).map(([name, val]) => ({
    label: name, value: Math.round(val * 100),
  }))

  return (
    <div className="rounded-2xl p-6 space-y-5 slide-up"
      style={{
        background: 'var(--card)', border: `1px solid ${color}33`,
        boxShadow: `0 0 32px ${color}14`
      }}>
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl" style={{ background: `${color}22` }}>
          <Icon size={22} style={{ color }} />
        </div>
        <div>
          <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Variant Classification</p>
          <h2 className="font-display font-700 text-2xl" style={{ color }}>
            {variant}
          </h2>
        </div>
      </div>

      <SeverityBar value={severity_score} />



      {/* Radar chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="var(--rim)" />
            <PolarAngleAxis dataKey="label"
              tick={{ fill: '#7a94b0', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.18}
              strokeWidth={2} />
            <RechartTip
              contentStyle={{
                background: 'var(--card)', border: '1px solid var(--rim)',
                borderRadius: 8, fontFamily: 'DM Sans'
              }}
              formatter={(v) => [`${v}%`, 'Probability']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Prob bars */}
      <div className="space-y-2">
        {Object.entries(probabilities).map(([name, p]) => {
          const c = VARIANT_COLOR[name] || 'var(--cyan)'
          return (
            <div key={name} className="flex items-center gap-3">
              <span className="w-20 text-xs font-mono" style={{ color: c }}>{name}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--rim)' }}>
                <div className="h-full rounded-full bar-animate"
                  style={{ width: `${Math.round(p * 100)}%`, background: c }} />
              </div>
              <span className="w-10 text-right text-xs font-mono opacity-60">
                {Math.round(p * 100)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Mesh card ────────────────────────────────────────────────────────────── */
function MeshCard({ mesh }) {
  const items = [
    { label: 'Lung Volume', value: mesh.volume_voxels.toLocaleString(), unit: 'vx' },
    { label: 'Surface', value: mesh.surface_voxels.toLocaleString(), unit: 'vx' },
    { label: 'Vol Fraction', value: (mesh.volume_fraction * 100).toFixed(1), unit: '%' },
    { label: 'S/V Ratio', value: mesh.surface_to_volume.toFixed(3) },
    { label: 'HD95 approx', value: mesh.hausdorff_approx_mm, unit: 'mm' },
    { label: 'Slices', value: mesh.slice_count },
  ]
}

/* ── CT Reconstruction card ───────────────────────────────────────────────── */
function ReconCard({ reconstruction, volumeData }) {
  const src = `data:image/png;base64,${reconstruction.base64_png}`
}

/* ── Progression chart ────────────────────────────────────────────────────── */
function ProgressionCard({ progression }) {
  if (!progression?.length) return null

  const isFlat = progression.every(p => p.rate === null && p.delta_norm === null)

  // Chart data
  const chartData = progression.map(p => ({
    step:     `T+${p.step}`,
    severity: +(p.severity * 100).toFixed(1),
    // Only include rate in chart data if it exists
    ...(p.rate !== null && p.rate !== undefined
      ? { rate: +(p.rate * 100).toFixed(1) }
      : {}),
  }))

  return (
    <div className="rounded-2xl p-6 space-y-4 slide-up delay-300"
         style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock size={18} style={{ color: 'var(--amber)' }} />
        <h3 className="font-display font-600 text-base">Disease Progression Simulation</h3>
        <span className="ml-auto text-xs font-mono opacity-40">
          {progression.length} future steps
        </span>
      </div>

      {/* Flat / sub-clinical state */}
      {isFlat ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6 rounded-xl"
             style={{ background: 'var(--panel)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl"></span>
            <span className="font-display font-600 text-base"
                  style={{ color: 'var(--teal)' }}>
              No Significant Progression Detected
            </span>
          </div>
          <p className="text-xs font-mono opacity-50 text-center max-w-xs">
            Severity is below the 5% clinical threshold. The digital twin predicts
            a stable disease state with no meaningful trajectory over the simulation window.
          </p>
          <div className="px-4 py-2 rounded-lg"
               style={{ background: 'rgba(0,184,159,0.12)',
                        border: '1px solid rgba(0,184,159,0.3)' }}>
            <span className="text-sm font-mono" style={{ color: 'var(--teal)' }}>
              Severity held at {(progression[0].severity * 100).toFixed(1)}% across all steps
            </span>
          </div>
        </div>
      ) : (
        /* Normal progression chart */
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}
                       margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
              <XAxis dataKey="step"
                     tick={{ fill: '#7a94b0', fontSize: 10,
                             fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fill: '#7a94b0', fontSize: 10,
                             fontFamily: 'JetBrains Mono' }} />
              <RechartTip
                contentStyle={{ background: 'var(--card)',
                                border: '1px solid var(--rim)',
                                borderRadius: 8, fontFamily: 'DM Sans' }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'DM Sans' }} />
              <Line type="monotone" dataKey="severity"
                    name="Severity (%)"
                    stroke="var(--coral)" strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--coral)' }} />
              <Line type="monotone" dataKey="rate"
                    name="Rate of Change (%)"
                    stroke="var(--cyan)" strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--cyan)' }}
                    strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Step table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr style={{ color: 'rgba(122,148,176,0.7)' }}>
              <th className="text-left py-1 pr-4">Step</th>
              <th className="text-right py-1 pr-4">Severity</th>
              <th className="text-right py-1">Rate of Change</th>
            </tr>
          </thead>
          <tbody>
            {progression.map(p => (
              <tr key={p.step} className="border-t"
                  style={{ borderColor: 'var(--rim)' }}>
                <td className="py-1 pr-4"
                    style={{ color: 'var(--cyan)' }}>
                  T+{p.step}
                </td>
                <td className="text-right py-1 pr-4">
                  <span style={{
                    color: p.severity > 0.6 ? 'var(--coral)'
                         : p.severity > 0.3 ? 'var(--amber)'
                         : 'var(--teal)'
                  }}>
                    {(p.severity * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="text-right py-1">
                  {p.rate === null || p.rate === undefined
                    ? <span style={{ color: 'var(--teal)',
                                     fontStyle: 'italic' }}>
                        — stable
                      </span>
                    : <span className="opacity-60">
                        {(p.rate * 100).toFixed(1)}%
                      </span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}

/* ── Metrics footer ───────────────────────────────────────────────────────── */
function MetricsBar({ metrics }) {
  return (
    <></>
  )
}

function CancerResultsPanel({ result }) {
  const { prediction, mesh, progression, metrics } = result
  const CANCER_COLORS = {
    "Adenocarcinoma": 'var(--cyan)',
    "Squamous Cell": 'var(--amber)',
    "Small Cell": 'var(--coral)',
    "Normal": 'var(--teal)',
  }
  const color = CANCER_COLORS[prediction.cancer_type] || 'var(--cyan)'

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-2xl p-6 space-y-4 slide-up"
        style={{
          background: 'var(--card)', border: `1px solid ${color}33`,
          boxShadow: `0 0 32px ${color}14`
        }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: `${color}22` }}>
            <AlertTriangle size={22} style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Cancer Type</p>
            <h2 className="font-display font-700 text-2xl" style={{ color }}>
              {prediction.cancer_type}
            </h2>
          </div>
          {/* <div className="ml-auto text-right">
            <p className="text-xs font-mono opacity-40">Confidence</p>
            <p className="font-display font-700 text-xl" style={{ color: 'var(--lavender)' }}>
              {Math.round(prediction.confidence * 100)}%
            </p>
          </div> */}
        </div>
        <SeverityBar value={prediction.severity_score} />
      </div>
      <MeshCard mesh={mesh} />
      {result.volume_data?.voxels_b64 && (
        <CTViewer3D volumeData={result.volume_data} />
      )}
      <SeverityMetricsCard result={result} accentColor="var(--coral)" />
      <ProgressionCard progression={progression} variant={prediction?.variant} />
      <MetricsBar metrics={metrics} />
    </div>
  )
}

function FibrosisResultsPanel({ result }) {
  const { prediction, mesh, progression, metrics } = result
  const STAGE_COLOR = { Mild: 'var(--teal)', Moderate: 'var(--amber)', Severe: 'var(--coral)' }
  const color = STAGE_COLOR[prediction.stage] || 'var(--cyan)'
  const fibChartData = result.progression.map((p, i) => ({
    step: p.weeks != null ? `Week ${p.weeks}` : `Week ${i * 4}`,
    fvc: p.fvc_ml,
    risk: +(p.risk * 100).toFixed(1),
  }))

  return (
    <div className="space-y-5">
      {/* FVC card */}
      <div className="rounded-2xl p-6 space-y-5 slide-up"
        style={{
          background: 'var(--card)', border: `1px solid ${color}33`,
          boxShadow: `0 0 32px ${color}14`
        }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: `${color}22` }}>
            <Activity size={22} style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">
              Pulmonary Fibrosis — {prediction.stage}
            </p>
            <h2 className="font-display font-700 text-2xl" style={{ color }}>
              FVC: {prediction.fvc_ml.toLocaleString()} mL
            </h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs font-mono opacity-40">Risk Score</p>
            <p className="font-display font-700 text-xl" style={{ color: 'var(--coral)' }}>
              {Math.round(prediction.risk_score * 100)}%
            </p>
          </div>
        </div>

        {/* 95% CI */}
        <div className="p-4 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
          <p className="text-xs font-mono opacity-40 mb-2">95% Confidence Interval</p>
          <p className="font-display font-600 text-lg" style={{ color: 'var(--lavender)' }}>
            [{prediction.confidence_interval_95[0].toLocaleString()} –{' '}
            {prediction.confidence_interval_95[1].toLocaleString()}] mL
          </p>
        </div>

        {/* Stage bars */}
        <div className="space-y-2">
          {Object.entries(prediction.stage_probabilities).map(([name, p]) => {
            const c = STAGE_COLOR[name] || 'var(--cyan)'
            return (
              <div key={name} className="flex items-center gap-3">
                <span className="w-24 text-xs font-mono" style={{ color: c }}>{name}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--rim)' }}>
                  <div className="h-full rounded-full bar-animate"
                    style={{ width: `${Math.round(p * 100)}%`, background: c }} />
                </div>
                <span className="w-10 text-right text-xs font-mono opacity-60">
                  {Math.round(p * 100)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <MeshCard mesh={mesh} />

      <div className="rounded-2xl p-6 space-y-4 slide-up delay-300"
        style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: 'var(--amber)' }} />
          <h3 className="font-display font-600 text-base">FVC Decline Trajectory</h3>
          <span className="ml-2 px-2 py-0.5 rounded text-xs font-mono"
            style={{ background: 'rgba(155,138,255,0.15)', color: 'var(--lavender)' }}>
            OSIC Digital Twin
          </span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fibChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
              <XAxis dataKey="step"
                tick={{ fill: '#7a94b0', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis yAxisId="fvc" domain={['auto', 'auto']}
                tick={{ fill: '#7a94b0', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis yAxisId="risk" orientation="right"
                tick={{ fill: '#7a94b0', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <RechartTip
                contentStyle={{
                  background: 'var(--card)', border: '1px solid var(--rim)',
                  borderRadius: 8, fontFamily: 'DM Sans'
                }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'DM Sans' }} />
              <Line yAxisId="fvc" type="monotone" dataKey="fvc"
                name="FVC (mL)" stroke="var(--teal)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--teal)' }} />
              <Line yAxisId="risk" type="monotone" dataKey="risk"
                name="Risk (%)" stroke="var(--coral)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--coral)' }}
                strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Step-by-step table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr style={{ color: 'rgba(122,148,176,0.7)' }}>
                <th className="text-left py-1 pr-4">Week</th>
                <th className="text-right py-1 pr-4">FVC (mL)</th>
                <th className="text-right py-1 pr-4">Risk</th>
                <th className="text-right py-1">Stage</th>
              </tr>
            </thead>
            <tbody>
              {result.progression.map(p => {
                const stageColor = {
                  Mild: 'var(--teal)', Moderate: 'var(--amber)',
                  Severe: 'var(--coral)'
                }[p.stage]
                return (
                  <tr key={p.step} className="border-t" style={{ borderColor: 'var(--rim)' }}>
                    <td className="py-1 pr-4" style={{ color: 'var(--cyan)' }}>
                      {p.weeks != null ? `Week ${p.weeks}` : `Week ${p.step * 4}`}
                    </td>
                    <td className="text-right py-1 pr-4"
                      style={{ color: 'var(--teal)' }}>{p.fvc_ml.toLocaleString()}</td>
                    <td className="text-right py-1 pr-4">
                      <span style={{
                        color: p.risk > 0.6 ? 'var(--coral)' :
                          p.risk > 0.3 ? 'var(--amber)' : 'var(--teal)'
                      }}>
                        {(p.risk * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-1" style={{ color: stageColor }}>{p.stage}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* <SeverityMetricsCard result={result} accentColor="var(--lavender)" /> */}
      {/* <ProgressionCard progression={projection} /> */}
      <MetricsBar metrics={metrics} />
      {/* {result.metadata_used && (
        <div className="rounded-2xl p-4 slide-up delay-400"
          style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

          <div className="flex flex-wrap gap-3">
            {Object.entries(result.metadata_used).map(([k, v]) => (
              <div key={k} className="px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
                <span className="text-xs font-mono opacity-40 mr-2">{k.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--lavender)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )} */}
    </div>
  )
}

function NoduleResultsPanel({ result }) {
  const { prediction, segmentation, trajectory, metrics } = result
  const isMalignant = prediction.label === 'Malignant'
  const mainColor = isMalignant ? 'var(--coral)' : 'var(--teal)'
  const Icon = isMalignant ? AlertTriangle : Shield

  // Trajectory chart data
  const NODULE_MONTHS = [0, 2, 4, 6, 9, 12, 18]
  const chartData = progression.map(p => ({
    step: `T+${p.step}`,
    severity: +(p.severity * 100).toFixed(1),
    // Use rate field if available, fall back to delta_norm normalised
    rate: p.rate !== undefined
      ? +(p.rate * 100).toFixed(1)
      : +(Math.min(1, p.delta_norm / (progression[0].delta_norm + 1e-8)) * 100).toFixed(1),
  }))

  return (
    <div className="space-y-5">

      {/* ── Classification card ─────────────────────────────────────── */}
      <div className="rounded-2xl p-6 space-y-4 slide-up"
        style={{
          background: 'var(--card)',
          border: `1px solid ${mainColor}33`,
          boxShadow: `0 0 32px ${mainColor}14`
        }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ background: `${mainColor}22` }}>
            <Icon size={22} style={{ color: mainColor }} />
          </div>
          <div>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">
              Nodule Classification
            </p>
            <h2 className="font-display font-700 text-2xl" style={{ color: mainColor }}>
              {prediction.label}
            </h2>
          </div>
          <div className="ml-auto grid grid-cols-2 gap-4 text-right">
            {Object.entries(prediction.probabilities).map(([label, prob]) => (
              <div key={label}>
                <p className="text-xs font-mono opacity-40">{label}</p>
                <p className="font-display font-700 text-lg"
                  style={{ color: label === 'Malignant' ? 'var(--coral)' : 'var(--teal)' }}>
                  {Math.round(prob * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Probability bars */}
        <div className="space-y-2">
          {Object.entries(prediction.probabilities).map(([label, prob]) => {
            const c = label === 'Malignant' ? 'var(--coral)' : 'var(--teal)'
            return (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 text-xs font-mono" style={{ color: c }}>{label}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--rim)' }}>
                  <div className="h-full rounded-full bar-animate"
                    style={{ width: `${Math.round(prob * 100)}%`, background: c }} />
                </div>
                <span className="w-10 text-right text-xs font-mono opacity-60">
                  {Math.round(prob * 100)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Segmentation card ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl p-6 space-y-4 slide-up delay-100"
          style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
          <div className="flex items-center gap-2">
            <Activity size={18} style={{ color: 'var(--cyan)' }} />
            <h3 className="font-display font-600 text-base">Segmentation MIP</h3>
            <span className="ml-auto text-xs font-mono opacity-40">depth projection</span>
          </div>
          <div className="flex justify-center">
            <div className="relative">
              <img
                src={`data:image/png;base64,${segmentation.mip_base64_png}`}
                alt="nodule MIP"
                className="ct-flicker rounded-lg"
                style={{
                  width: 192, height: 192,
                  imageRendering: 'pixelated',
                  filter: 'brightness(1.2) contrast(1.3) hue-rotate(160deg) saturate(2)',
                  boxShadow: '0 0 32px rgba(0,212,232,0.2)',
                }}
              />
              <div className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ background: 'linear-gradient(135deg,rgba(0,212,232,0.06),transparent)' }} />
            </div>
          </div>
          <p className="text-center text-xs font-mono opacity-40">
            Max intensity projection · nodule probability map
          </p>
        </div>

        {/* Nodule stats */}
        <div className="rounded-2xl p-6 space-y-3 slide-up delay-200"
          style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
          <h3 className="font-display font-600 text-base">Nodule Statistics</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Candidates', segmentation.candidate_count, ''],
              ['Max Prob', (segmentation.max_prob * 100).toFixed(1), '%'],
              ['Mean Prob', (segmentation.mean_prob * 100).toFixed(2), '%'],
              ['Vol Fraction', (segmentation.volume_fraction * 100).toFixed(3), '%'],
            ].map(([label, val, unit]) => (
              <div key={label} className="p-3 rounded-xl text-center"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
                <p className="text-xs font-mono opacity-40 mb-1">{label}</p>
                <p className="font-display font-600 text-lg" style={{ color: 'var(--cyan)' }}>
                  {val}{unit && <span className="text-xs opacity-50 ml-0.5">{unit}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Candidate list */}
          {segmentation.candidates.length > 0 && (
            <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
              <p className="text-xs font-mono opacity-40">Top candidates</p>
              {segmentation.candidates.map(c => (
                <div key={c.nodule_id}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
                  <span style={{ color: 'var(--lavender)' }}>#{c.nodule_id}</span>
                  <span className="opacity-60">{c.volume_voxels} vx</span>
                  <span style={{ color: c.peak_prob > 0.7 ? 'var(--coral)' : 'var(--teal)' }}>
                    {(c.peak_prob * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Growth Trajectory card ─────────────────────────────────────── */}
      <div className="rounded-2xl p-6 space-y-4 slide-up delay-300"
        style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: 'var(--amber)' }} />
          <h3 className="font-display font-600 text-base">Nodule Growth Trajectory</h3>
          <span className="ml-auto text-xs font-mono opacity-40">
            {trajectory.length}-step LSTM projection
          </span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
              <XAxis dataKey="step"
                tick={{ fill: '#7a94b0', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fill: '#7a94b0', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <RechartTip
                contentStyle={{
                  background: 'var(--card)', border: '1px solid var(--rim)',
                  borderRadius: 8, fontFamily: 'DM Sans'
                }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'DM Sans' }} />
              <Line type="monotone" dataKey="malignancy" name="Malignancy (%)"
                stroke="var(--coral)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--coral)' }} />
              <Line type="monotone" dataKey="severity" name="Severity (%)"
                stroke="var(--amber)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--amber)' }}
                strokeDasharray="4 2" />
              <Line type="monotone" dataKey="growthRate" name="Growth Rate (×100)"
                stroke="var(--cyan)" strokeWidth={1.5}
                dot={{ r: 2, fill: 'var(--cyan)' }}
                strokeDasharray="2 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trajectory table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr style={{ color: 'rgba(122,148,176,0.7)' }}>
                <th className="text-left py-1 pr-4">Step</th>
                <th className="text-right py-1 pr-4">Malignancy</th>
                <th className="text-right py-1 pr-4">Severity</th>
                <th className="text-right py-1">Growth Δ</th>
              </tr>
            </thead>
            <tbody>
              {trajectory.map(t => (
                <tr key={t.step} className="border-t" style={{ borderColor: 'var(--rim)' }}>
                  <td className="py-1 pr-4" style={{ color: 'var(--cyan)' }}>T+{t.step}</td>
                  <td className="text-right py-1 pr-4">
                    <span style={{ color: t.malignancy_prob > 0.5 ? 'var(--coral)' : 'var(--teal)' }}>
                      {(t.malignancy_prob * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-1 pr-4">
                    <span style={{
                      color: t.severity > 0.6 ? 'var(--coral)' :
                        t.severity > 0.3 ? 'var(--amber)' : 'var(--teal)'
                    }}>
                      {(t.severity * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-1 opacity-60">{p.rate !== undefined
                    ? `${(p.rate * 100).toFixed(1)}%`
                    : `${Math.min(100, (p.delta_norm / (progression[0]?.delta_norm + 1e-8)) * 100).toFixed(1)}%`
                  }</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MetricsBar metrics={metrics} />
    </div>
  )
}



/* ── Root export ──────────────────────────────────────────────────────────── */
export default function ResultsPanel({ result }) {
  if (!result) return null
  const condition = result.condition || 'covid19'

  if (condition === 'cancer') return <CancerResultsPanel result={result} />
  if (condition === 'fibrosis') return <FibrosisResultsPanel result={result} />
  if (condition === 'nodules') return <NoduleResultsPanel result={result} />

  const { prediction, mesh, reconstruction, progression, metrics } = result

  return (
    <div className="space-y-5">
      <VariantCard prediction={prediction} />
      <SeverityMetricsCard result={result} accentColor="var(--cyan)" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <MeshCard mesh={mesh} />
        <ReconCard reconstruction={reconstruction} />
      </div>
      {result.volume_data && (
        <CTViewer3D volumeData={result.volume_data} />
      )}
      <ProgressionCard progression={progression} />
      <MetricsBar metrics={metrics} />
    </div>
  )
}
