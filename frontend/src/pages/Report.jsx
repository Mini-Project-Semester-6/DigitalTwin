import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  Tooltip as RechartTip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import {
  FileText, AlertTriangle, CheckCircle, Activity,
  ArrowLeft, Download, Layers, TrendingDown, Minus,
} from 'lucide-react'
import { useResultsStore } from '../hooks/useResultsStore'

const COLOR = {
  covid: 'var(--cyan)',
  cancer: 'var(--coral)',
  fibrosis: 'var(--lavender)',
  ok: 'var(--teal)',
  warn: 'var(--amber)',
  risk: 'var(--coral)',
  neutral: '#7a94b0',
}

function fmtPct(v) { return v != null ? `${(v * 100).toFixed(1)}%` : '—' }
function fmtNum(v, dp = 2) { return v != null ? Number(v).toFixed(dp) : '—' }

function severityLabel(v) {
  if (v == null) return { label: 'Unknown', color: COLOR.neutral }
  if (v < 0.3) return { label: 'Low', color: COLOR.ok }
  if (v < 0.65) return { label: 'Moderate', color: COLOR.warn }
  return { label: 'High', color: COLOR.risk }
}

function riskLabel(v) {
  if (v == null) return { label: 'Unknown', color: COLOR.neutral, Icon: Minus }
  if (v < 0.3) return { label: 'Low risk', color: COLOR.ok, Icon: CheckCircle }
  if (v < 0.65) return { label: 'Moderate risk', color: COLOR.warn, Icon: Activity }
  return { label: 'High risk', color: COLOR.risk, Icon: AlertTriangle }
}

function Card({ children, accent = 'var(--rim)', className = '' }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`}
      style={{ background: 'var(--card)', border: `1px solid ${accent}` }}>
      {children}
    </div>
  )
}

function SectionHead({ icon: Icon, title, subtitle, accent = 'var(--cyan)' }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="mt-0.5 p-2 rounded-xl flex-shrink-0" style={{ background: `${accent}18` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div>
        <h2 className="font-display font-700 text-lg leading-tight">{title}</h2>
        {subtitle && <p className="text-xs opacity-50 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Placeholder({ condition, color }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 rounded-2xl"
      style={{ background: 'var(--panel)', border: '1px dashed var(--rim)' }}>
      <span className="text-xs font-mono opacity-40">No {condition} result yet</span>
      <Link to="/"
        className="px-4 py-2 rounded-xl text-xs font-mono transition-colors"
        style={{ background: `${color}18`, border: `1px solid ${color}44`, color }}>
        Run {condition} analysis →
      </Link>
    </div>
  )
}

/* ── Shared severity + metrics block ─────────────────────────────────────── */
function SeverityMetricsBlock({ result, accent }) {
  const pred = result?.prediction ?? {}
  const metrics = result?.metrics ?? {}
  const sevVal = pred.severity_score ?? pred.severity ?? null
  const sevPct = sevVal != null ? Math.round(sevVal * 100) : null
  const sevColor = sevPct == null ? COLOR.neutral
    : sevPct < 30 ? COLOR.ok
      : sevPct < 65 ? COLOR.warn
        : COLOR.risk
  const metricRows = Object.entries(metrics).filter(([, v]) => typeof v === 'number')
  if (sevVal == null && metricRows.length === 0) return null
  return (
    <Card accent={`${accent}33`}>
      <p className="text-xs font-mono uppercase tracking-widest opacity-40 mb-3">Severity Score & Metrics</p>
      {sevVal != null && (
        <div className="space-y-1 mb-4">
          <div className="flex justify-between">
            <span className="text-xs font-mono opacity-50">Severity</span>
            <span className="font-display font-700 text-xl" style={{ color: sevColor }}>{sevPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--rim)' }}>
            <div className="h-full rounded-full" style={{ width: `${sevPct}%`, background: sevColor, transition: 'width 0.7s ease' }} />
          </div>
        </div>
      )}
      {metricRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {metricRows.map(([key, val]) => {
            const display = Number.isInteger(val) ? val.toLocaleString()
              : val > 0 && val < 1 ? `${(val * 100).toFixed(2)}%`
                : val.toFixed(4)
            return (
              <div key={key} className="p-3 rounded-xl"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
                <p className="text-xs font-mono opacity-40 mb-1 truncate">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p className="font-display font-600 text-base" style={{ color: accent }}>{display}</p>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ── COVID section ────────────────────────────────────────────────────────── */
function CovidSection({ result }) {
  if (!result) return <Placeholder condition="COVID-19" color={COLOR.covid} />
  const pred = result.prediction ?? {}
  const mesh = result.mesh ?? {}
  const prog = result.progression ?? []
  const sev = severityLabel(pred.severity_score)
  const isPos = pred.variant?.toLowerCase().includes('positive')

  const narrative = (() => {
    const variant = pred.variant ?? 'Unknown'
    const conf = pred.confidence != null ? `${(pred.confidence * 100).toFixed(0)}%` : '—'
    const sevLabel = sev.label.toLowerCase()
    const worsening = prog.length > 1 ? prog[prog.length - 1].severity > prog[0].severity : null
    let text = `The COVID-19 model classified this scan as **${variant}** with ${conf} confidence. `
    if (isPos) {
      text += `Severity is **${fmtPct(pred.severity_score)}** (${sevLabel}). `
      text += sevLabel === 'low' ? 'Mild involvement with favourable outlook. '
        : sevLabel === 'moderate' ? 'Moderate bilateral involvement — clinical monitoring advised. '
          : 'Significant damage — urgent clinical review recommended. '
    } else {
      text += `No COVID opacity patterns detected. Severity ${fmtPct(pred.severity_score)} is consistent with a non-infected baseline. `
    }
    if (mesh.volume_voxels) text += `Lung volume estimated at **${mesh.volume_voxels?.toLocaleString()} voxels** (vol fraction ${fmtPct(mesh.volume_fraction)}). `
    if (prog.length > 1) {
      text += worsening
        ? `LSTM projection shows a **rising severity trend** — potential deterioration if untreated. `
        : `LSTM projection shows a **stable or declining trajectory** — disease may be self-limiting. `
    }
    return text
  })()

  const radarData = pred.probabilities
    ? Object.entries(pred.probabilities).map(([name, val]) => ({ label: name, value: Math.round(val * 100) }))
    : []

  return (
    <div className="space-y-4">
      <Card accent={`${COLOR.covid}33`}>
        <SectionHead icon={Activity} title="COVID-19 Analysis" accent={COLOR.covid}
          subtitle={`Variant: ${pred.variant ?? '—'}  ·  Confidence: ${fmtPct(pred.confidence)}`} />
        <p className="text-sm leading-relaxed opacity-80">
          {narrative.split('**').map((p, i) => i % 2 === 1 ? <strong key={i} style={{ color: COLOR.covid }}>{p}</strong> : p)}
        </p>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Variant', value: pred.variant ?? '—', color: isPos ? COLOR.risk : COLOR.ok },
          { label: 'Severity', value: fmtPct(pred.severity_score), color: sev.color },
          { label: 'Confidence', value: fmtPct(pred.confidence), color: COLOR.covid },
          { label: 'Lung Volume', value: `${(mesh.volume_voxels ?? 0).toLocaleString()} vx`, color: COLOR.neutral },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-xl text-center"
            style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
            <p className="text-xs font-mono opacity-40 mb-1">{label}</p>
            <p className="font-display font-700 text-lg" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
      <SeverityMetricsBlock result={result} accent={COLOR.covid} />
      {(radarData.length > 0 || prog.length > 1) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {radarData.length > 0 && (
            <Card>
              <p className="text-xs font-mono opacity-40 mb-2 uppercase tracking-widest">Variant probabilities</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--rim)" />
                    <PolarAngleAxis dataKey="label" tick={{ fill: '#7a94b0', fontSize: 10 }} />
                    <Radar dataKey="value" stroke={COLOR.covid} fill={COLOR.covid} fillOpacity={0.18} strokeWidth={2} />
                    <RechartTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--rim)', borderRadius: 8 }}
                      formatter={v => [`${v}%`, 'Probability']} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {prog.length > 1 && (
            <Card>
              <p className="text-xs font-mono opacity-40 mb-2 uppercase tracking-widest">Progression trajectory</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={prog.map(p => ({ step: `T+${p.step}`, severity: +(p.severity * 100).toFixed(1) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                    <XAxis dataKey="step" tick={{ fill: '#7a94b0', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#7a94b0', fontSize: 9 }} />
                    <RechartTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--rim)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="severity" stroke={COLOR.covid} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Cancer section ───────────────────────────────────────────────────────── */
function CancerSection({ result }) {
  if (!result) return <Placeholder condition="Lung Cancer" color={COLOR.cancer} />
  const pred = result.prediction ?? {}
  const mesh = result.mesh ?? {}
  const prog = result.progression ?? []
  const sev = severityLabel(pred.severity_score)
  const isNormal = pred.cancer_type?.toLowerCase() === 'normal'
  const cancerType = pred.cancer_type ?? 'Unknown'
  const conf = pred.confidence ?? 0
  const probs = pred.probabilities ?? {}

  const narrative = (() => {
    let text = `The cancer model classified the scan as **${cancerType}** with **${fmtPct(conf)}** confidence. `
    if (isNormal) {
      text += `No malignant features identified. All cancer subtype probabilities are negligible. `
    } else {
      if (cancerType.toLowerCase().includes('adenocarcinoma'))
        text += `Adenocarcinoma is the most common lung malignancy, typically peripheral. Early-stage carries a favourable prognosis. `
      else if (cancerType.toLowerCase().includes('squamous'))
        text += `Squamous cell carcinoma tends to arise centrally and is strongly linked to smoking. Bronchoscopic biopsy is recommended. `
      else if (cancerType.toLowerCase().includes('large'))
        text += `Large cell carcinoma is a diagnosis of exclusion. Immunohistochemical workup is advised for treatment planning. `
    }
    text += `Severity is **${fmtPct(pred.severity_score)}** (${sev.label.toLowerCase()}). `
    if (mesh.volume_voxels) text += `Lung volume is ${mesh.volume_voxels?.toLocaleString()} voxels; HD95 ≈ ${mesh.hausdorff_approx_mm ?? '—'} mm. `
    if (prog.length > 1) {
      const finalSev = prog[prog.length - 1]?.severity ?? 0
      text += finalSev > 0.5
        ? `LSTM simulation projects **increasing malignancy** — prompt staging advisable. `
        : `LSTM trajectory suggests **relatively stable** progression in the simulation window. `
    }
    return text
  })()

  const barData = Object.entries(probs).map(([name, val]) => ({
    name: name.replace('Carcinoma', 'Ca.').replace('Adenocarcinoma', 'Adeno.'),
    value: Math.round(val * 100),
  }))

  return (
    <div className="space-y-4">
      <Card accent={`${COLOR.cancer}33`}>
        <SectionHead icon={Layers} title="Lung Cancer Analysis" accent={COLOR.cancer}
          subtitle={`Type: ${cancerType}  ·  Confidence: ${fmtPct(conf)}`} />
        <p className="text-sm leading-relaxed opacity-80">
          {narrative.split('**').map((p, i) => i % 2 === 1 ? <strong key={i} style={{ color: COLOR.cancer }}>{p}</strong> : p)}
        </p>
      </Card>

      {/* Cross-model out-of-distribution warning */}
      {(() => {
        const store = (() => {
          try { return JSON.parse(localStorage.getItem('lungtwin_results_v1') || '{}') } catch { return {} }
        })()
        const fibSaved = store?.fibrosis?._savedAt
        const sameScan = fibSaved && result?._savedAt &&
          Math.abs(fibSaved - result._savedAt) < 10 * 60 * 1000
        // Also flag when all 4 probabilities are suspiciously close (uniform = confused model)
        const probVals = Object.values(probs)
        const maxProb = Math.max(...probVals)
        const minProb = Math.min(...probVals)
        const isUniform = probVals.length >= 3 && (maxProb - minProb) < 0.15
        if (!sameScan && !isUniform) return null
        return (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-xs"
            style={{ background: 'rgba(255,183,3,0.08)', border: '1px solid rgba(255,183,3,0.3)' }}>
            <span style={{ color: 'var(--amber)', fontSize: 16, lineHeight: 1 }}>⚠</span>
            <div style={{ color: 'var(--amber)' }} className="space-y-1">
              <p><strong>Out-of-distribution warning</strong></p>
              {isUniform && (
                <p className="opacity-80">
                  All four subtype probabilities are nearly equal (~{Math.round(maxProb * 100)}% each).
                  This near-uniform distribution indicates the cancer model does not recognise
                  any of its trained patterns in this scan — the input is likely from a different
                  disease domain (e.g. fibrosis, COVID-19, or healthy lung).
                </p>
              )}
              {sameScan && (
                <p className="opacity-80">
                  A fibrosis result was recorded for this same scan session. The cancer model
                  was not trained on fibrosis patterns and cannot produce a meaningful result
                  for this input. Do not interpret this cancer classification clinically.
                </p>
              )}
            </div>
          </div>
        )
      })()}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Cancer Type', value: cancerType, color: isNormal ? COLOR.ok : COLOR.cancer },
          { label: 'Severity', value: fmtPct(pred.severity_score), color: sev.color },
          { label: 'Confidence', value: fmtPct(conf), color: COLOR.cancer },
          { label: 'HD95 (mm)', value: fmtNum(mesh.hausdorff_approx_mm), color: COLOR.neutral },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-xl text-center"
            style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
            <p className="text-xs font-mono opacity-40 mb-1">{label}</p>
            <p className="font-display font-700 text-lg" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
      <SeverityMetricsBlock result={result} accent={COLOR.cancer} />
      {barData.length > 0 && (
        <Card>
          <p className="text-xs font-mono opacity-40 mb-2 uppercase tracking-widest">Subtype probabilities</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                <XAxis dataKey="name" tick={{ fill: '#7a94b0', fontSize: 10 }} />
                <YAxis tick={{ fill: '#7a94b0', fontSize: 9 }} />
                <RechartTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--rim)', borderRadius: 8 }}
                  formatter={v => [`${v}%`, 'Probability']} />
                <Bar dataKey="value" fill={COLOR.cancer} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ── Fibrosis section ─────────────────────────────────────────────────────── */
function FibrosisSection({ result }) {
  if (!result) return <Placeholder condition="Fibrosis" color={COLOR.fibrosis} />
  const fvc = result.fvc_prediction ?? result ?? {}
  const stage = result.stage ?? result ?? {}
  const traj = result.trajectory ?? result.progression ?? []
  const meta = result.metadata ?? {}
  const stageLabel = stage.stage ?? result.stage_label ?? result.prediction?.stage ?? '—'
  const riskScore = stage.risk_score ?? result.risk_score ?? result.prediction?.risk_score ?? null
  const risk = riskLabel(riskScore)

  const narrative = (() => {
    const fvcVal = fvc.fvc_ml != null ? `${Math.round(fvc.fvc_ml)} mL` : '—'
    const fvcPct = fvc.fvc_pct != null ? `${fvc.fvc_pct.toFixed(1)}%` : '—'
    const ciLo = fvc.ci_lo != null ? `${Math.round(fvc.ci_lo)} mL` : '—'
    const ciHi = fvc.ci_hi != null ? `${Math.round(fvc.ci_hi)} mL` : '—'
    let text = `Fibrosis staging: **${stageLabel}** with risk score **${fmtPct(riskScore)}** (${risk.label.toLowerCase()}). `
    text += `Predicted FVC is **${fvcVal}** (${fvcPct} of predicted normal), 95% CI [${ciLo} – ${ciHi}]. `
    if (stageLabel.toLowerCase() === 'mild')
      text += `Regular spirometry every 3–6 months recommended to detect early deterioration. `
    else if (stageLabel.toLowerCase() === 'moderate')
      text += `Anti-fibrotic therapy (nintedanib or pirfenidone) should be considered with a specialist. `
    else if (stageLabel.toLowerCase() === 'severe')
      text += `Lung transplantation evaluation and palliative care planning may be appropriate. `
    if (meta.age) text += `Patient: age ${meta.age}, ${meta.sex}, ${meta.smoking_status} smoker, baseline FVC ${meta.baseline_fvc ?? '—'} mL. `
    if (traj.length > 1) {
      const last = traj[traj.length - 1]?.fvc_ml ?? fvc.fvc_ml ?? 0
      const first = traj[0]?.fvc_ml ?? fvc.fvc_ml ?? 1
      const decline = ((first - last) / first) * 100
      text += decline > 5
        ? `LSTM projects **${decline.toFixed(1)}% FVC decline** over the next ${traj.length} steps — accelerated progression. `
        : `LSTM projects **stable FVC** — slower disease progression likely. `
    }
    return text
  })()

  const chartData = traj.map(t => ({
    step: `W+${t.weeks ?? t.step ?? '?'}`,
    fvc: Math.round(t.fvc_ml ?? fvc.fvc_ml ?? 0),
  }))

  return (
    <div className="space-y-4">
      <Card accent={`${COLOR.fibrosis}33`}>
        <SectionHead icon={TrendingDown} title="Pulmonary Fibrosis Analysis" accent={COLOR.fibrosis}
          subtitle={`Stage: ${stageLabel}  ·  Risk: ${fmtPct(riskScore)}`} />
        <p className="text-sm leading-relaxed opacity-80">
          {narrative.split('**').map((p, i) => i % 2 === 1 ? <strong key={i} style={{ color: COLOR.fibrosis }}>{p}</strong> : p)}
        </p>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Stage', value: stageLabel, color: COLOR.fibrosis },
          { label: 'Risk Score', value: fmtPct(riskScore), color: risk.color },
          { label: 'FVC (mL)', value: fvc.fvc_ml != null ? `${Math.round(fvc.fvc_ml)} mL` : '—', color: COLOR.fibrosis },
          { label: 'FVC %', value: fvc.fvc_pct != null ? `${fvc.fvc_pct.toFixed(1)}%` : '—', color: COLOR.neutral },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-xl text-center"
            style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
            <p className="text-xs font-mono opacity-40 mb-1">{label}</p>
            <p className="font-display font-700 text-lg" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
      <SeverityMetricsBlock result={result} accent={COLOR.fibrosis} />
      {chartData.length > 1 && (
        <Card>
          <p className="text-xs font-mono opacity-40 mb-2 uppercase tracking-widest">FVC decline trajectory</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                <XAxis dataKey="step" tick={{ fill: '#7a94b0', fontSize: 9 }} />
                <YAxis tick={{ fill: '#7a94b0', fontSize: 9 }} />
                <RechartTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--rim)', borderRadius: 8 }}
                  formatter={v => [`${v} mL`, 'FVC']} />
                <Line type="monotone" dataKey="fvc" stroke={COLOR.fibrosis} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ── Cross-model summary ──────────────────────────────────────────────────── */
function CrossModelSummary({ covid, cancer, fibrosis }) {
  const count = [covid, cancer, fibrosis].filter(Boolean).length
  const hasAny = count > 0

  const radarData = [
    { metric: 'COVID Severity', value: covid ? Math.round((covid.prediction?.severity_score ?? 0) * 100) : null },
    { metric: 'Cancer Conf.', value: cancer ? Math.round((cancer.prediction?.confidence ?? 0) * 100) : null },
    { metric: 'Fibrosis Risk', value: fibrosis ? Math.round((fibrosis.stage?.risk_score ?? 0) * 100) : null },
    { metric: 'COVID Conf.', value: covid ? Math.round((covid.prediction?.confidence ?? 0) * 100) : null },
    { metric: 'Cancer Severity', value: cancer ? Math.round((cancer.prediction?.severity_score ?? 0) * 100) : null },
    { metric: 'Fib. Stage Idx', value: fibrosis ? ({ mild: 25, moderate: 60, severe: 95 }[fibrosis.stage?.stage?.toLowerCase()] ?? 0) : null },
  ].filter(d => d.value != null)

  const narrative = (() => {
    if (!hasAny) return null
    const parts = []
    if (covid) {
      const isPos = covid.prediction?.variant?.toLowerCase().includes('positive')
      const sevPct = Math.round((covid.prediction?.severity_score ?? 0) * 100)
      parts.push(`The COVID-19 model classified this patient as **${isPos ? 'COVID-Positive' : 'COVID-Negative'}** (severity ${sevPct}%).`)
    }
    if (cancer) {
      const type = cancer.prediction?.cancer_type ?? 'Unknown'
      const confP = Math.round((cancer.prediction?.confidence ?? 0) * 100)
      parts.push(`The cancer model identified **${type}** with ${confP}% confidence.`)
    }
    if (fibrosis) {
      const stg = fibrosis.stage?.stage ?? 'Unknown'
      const riskP = Math.round((fibrosis.stage?.risk_score ?? 0) * 100)
      const fvcVal = fibrosis.fvc_prediction?.fvc_ml != null ? `${Math.round(fibrosis.fvc_prediction.fvc_ml)} mL` : '—'
      parts.push(`Fibrosis staging returned **${stg}** with ${riskP}% risk and predicted FVC ${fvcVal}.`)
    }
    parts.push(count === 3
      ? `All three models have been run. These AI outputs are decision-support tools — always review with a qualified clinician.`
      : `${3 - count} model${3 - count > 1 ? 's have' : ' has'} not yet been run. Run all three for a complete cross-disease report.`)
    return parts
  })()

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl"
        style={{ background: 'var(--panel)', border: '1px dashed var(--rim)' }}>
        <FileText size={40} className="opacity-20" />
        <p className="opacity-50 text-sm">No results yet. Run at least one model to generate a report.</p>
        <Link to="/" className="px-5 py-2.5 rounded-xl text-sm font-display font-600"
          style={{ background: 'var(--cyan)', color: 'var(--deep)' }}>
          Go to Analyze →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {[
          { label: 'COVID-19', done: !!covid, color: COLOR.covid },
          { label: 'Cancer', done: !!cancer, color: COLOR.cancer },
          { label: 'Fibrosis', done: !!fibrosis, color: COLOR.fibrosis },
        ].map(({ label, done, color }) => (
          <div key={label} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: done ? `${color}18` : 'var(--panel)', border: `1px solid ${done ? color : 'var(--rim)'}` }}>
            {done ? <CheckCircle size={14} style={{ color }} /> : <Minus size={14} className="opacity-30" />}
            <span className="text-xs font-mono" style={{ color: done ? color : '#7a94b0' }}>{label}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5 space-y-3"
        style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <SectionHead icon={FileText} title="Combined Assessment" accent="var(--white)"
          subtitle={`${count} of 3 models completed`} />
        <div className="space-y-3 text-sm leading-relaxed opacity-80">
          {narrative?.map((para, i) => (
            <p key={i}>
              {para.split('**').map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-white">{part}</strong> : part
              )}
            </p>
          ))}
        </div>
      </div>

      {radarData.length >= 3 && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>
          <p className="text-xs font-mono opacity-40 mb-2 uppercase tracking-widest">Cross-model severity & confidence radar</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--rim)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#7a94b0', fontSize: 10 }} />
                <Radar dataKey="value" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.15} strokeWidth={2} />
                <RechartTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--rim)', borderRadius: 8 }}
                  formatter={v => [`${v}%`, 'Score']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-xs"
        style={{ background: 'rgba(255,183,3,0.08)', border: '1px solid rgba(255,183,3,0.25)' }}>
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--amber)' }} />
        <p className="opacity-70">
          <strong style={{ color: 'var(--amber)' }}>Research use only.</strong>{' '}
          These predictions are not validated for clinical diagnosis and must be reviewed by a qualified clinician.
        </p>
      </div>
    </div>
  )
}

/* ── Page root ────────────────────────────────────────────────────────────── */
export default function Report() {
  const { results, clearAll } = useResultsStore()
  const { covid19: covid, cancer, fibrosis } = results
  const [activeTab, setActiveTab] = useState('summary')

  const tabs = [
    { id: 'summary', label: 'Summary', color: null },
    { id: 'covid19', label: 'COVID-19', color: COLOR.covid, hasResult: !!covid },
    { id: 'cancer', label: 'Cancer', color: COLOR.cancer, hasResult: !!cancer },
    { id: 'fibrosis', label: 'Fibrosis', color: COLOR.fibrosis, hasResult: !!fibrosis },
  ]

  const handleDownloadAll = () => {
    const blob = new Blob(
      [JSON.stringify({ covid19: covid, cancer, fibrosis, generatedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `lung-twin-full-report-${Date.now()}.json` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/" className="flex items-center gap-1.5 text-xs font-mono opacity-50 hover:opacity-100 transition-opacity mb-1">
            <ArrowLeft size={12} /> Analyze
          </Link>
          <h1 className="font-display font-700 text-3xl tracking-tight">Full Analysis Report</h1>
          <p className="text-sm opacity-50 mt-1">Cross-model narrative summary across all three disease domains</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(covid || cancer || fibrosis) && (
            <>
              <button onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)', color: 'var(--teal)' }}>
                <Download size={13} /> Export JSON
              </button>
              <button onClick={clearAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)', color: '#7a94b0' }}>
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(({ id, label, color, hasResult }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="relative px-4 py-2 rounded-xl text-sm font-mono transition-all duration-200"
            style={{
              background: activeTab === id ? `${color || 'rgba(255,255,255,0.1)'}22` : 'var(--panel)',
              border: `1px solid ${activeTab === id ? (color || 'rgba(255,255,255,0.4)') : 'var(--rim)'}`,
              color: activeTab === id ? (color || 'var(--white)') : '#7a94b0',
            }}>
            {label}
            {hasResult && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === 'summary' && <CrossModelSummary covid={covid} cancer={cancer} fibrosis={fibrosis} />}
        {activeTab === 'covid19' && <CovidSection result={covid} />}
        {activeTab === 'cancer' && <CancerSection result={cancer} />}
        {activeTab === 'fibrosis' && <FibrosisSection result={fibrosis} />}
      </div>
    </div>
  )
}