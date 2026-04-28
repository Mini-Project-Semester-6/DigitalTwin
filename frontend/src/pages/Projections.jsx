import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { TrendingUp, Calendar, AlertTriangle, Activity } from 'lucide-react'
import api, { generateProjections } from '../lib/api'

export default function Projections() {
  const { scanId }  = useParams()
  const navigate    = useNavigate()
  const [analysis,    setAnalysis]    = useState(null)
  const [projections, setProjections] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [activePoint, setActivePoint] = useState(null)

  useEffect(() => {
    const a = api.getAnalysis(scanId)
    if (!a) { navigate('/'); return }
    setAnalysis(a)
    setLoading(true)
    api.getProjections(scanId, a).then(p => {
      setProjections(p)
      setLoading(false)
    })
  }, [scanId, navigate])

  if (loading || !analysis || !projections) {
    return (
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="label-tag">Computing projections...</div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="panel h-48 shimmer" />)}
        </div>
      </div>
    )
  }

  const { points, survival, baseRisk, progressionRate } = projections
  const currentRisk = analysis.prediction.risk_level

  // Combine baseline + projections
  const baselinePoint = {
    month: 0,
    label: 'Now',
    nodule_probability: analysis.prediction.nodule_probability,
    volume_mm3:         analysis.geometry.volume_mm3,
    confidence_upper:   Math.min(1, analysis.prediction.nodule_probability + 0.1),
    confidence_lower:   Math.max(0, analysis.prediction.nodule_probability - 0.1),
  }
  const allPoints = [baselinePoint, ...points]

  const riskColor  = currentRisk === 'HIGH' ? 'var(--pulse)' :
                     currentRisk === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'
  const THRESHOLD  = 0.65

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="label-tag mb-1">Future Projections</div>
          <h2 className="font-display text-2xl font-bold text-black">
            4.5-Year Digital Twin Forecast
          </h2>
          <div className="label-tag mt-1">{analysis.fileName}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/analysis/${scanId}`)} className="btn-neon"
            style={{ borderColor: 'var(--dim)', color: 'var(--dim)' }}>
            <span>← Back to Analysis</span>
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Current Probability"
          value={`${(baseRisk * 100).toFixed(0)}%`}
          sub="Nodule probability"
          color={riskColor}
          icon={Activity}
        />
        <SummaryCard
          label="Progression Rate"
          value={`+${(progressionRate * 100).toFixed(1)}%`}
          sub="Per 6-month interval"
          color="var(--warn)"
          icon={TrendingUp}
        />
        <SummaryCard
          label="12-Month Outlook"
          value={`${(points[1]?.nodule_probability * 100 || 0).toFixed(0)}%`}
          sub={points[1]?.risk_level || '—'}
          color={points[1]?.risk_level === 'HIGH' ? 'var(--pulse)' :
                 points[1]?.risk_level === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'}
          icon={Calendar}
        />
        <SummaryCard
          label="Next Action"
          value={points[0]?.recommended_action?.split(' ').slice(0, 2).join(' ') || '—'}
          sub={points[0]?.recommended_action?.split(' ').slice(2).join(' ') || ''}
          color="var(--accent)"
          icon={AlertTriangle}
        />
      </div>

      {/* Main probability chart */}
      <div className="panel p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-tag">Nodule Probability Over Time</div>
            <div className="text-black font-medium text-sm mt-0.5">
              Projected using digital twin model · 95% confidence band
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <LegendItem color="var(--accent)" label="Probability" />
            <LegendItem color="rgba(0,212,255,0.15)" label="Confidence Band" solid={false} />
            <LegendItem color="var(--pulse)" label={`High Risk (>${THRESHOLD * 100}%)`} dashed />
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={allPoints} onMouseLeave={() => setActivePoint(null)}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.08} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--dim)', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            <YAxis
              domain={[0, 1]}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: 'var(--dim)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            />
            <Tooltip content={<ProbTooltip />} />
            <ReferenceLine
              y={THRESHOLD}
              stroke="var(--pulse)"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
              label={{ value: 'High Risk', fill: 'var(--pulse)', fontSize: 10, position: 'right' }}
            />
            {/* Confidence band */}
            <Area
              dataKey="confidence_upper"
              stroke="none"
              fill="url(#confGrad)"
              fillOpacity={1}
              activeDot={false}
            />
            <Area
              dataKey="confidence_lower"
              stroke="none"
              fill="var(--void)"
              fillOpacity={1}
              activeDot={false}
            />
            {/* Main line */}
            <Area
              dataKey="nodule_probability"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#probGrad)"
              dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'white', strokeWidth: 1 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-5">

        {/* Volume growth chart */}
        <div className="panel p-6">
          <div className="label-tag mb-4">Projected Volume Growth (mm³)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={allPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--dim)', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fill: 'var(--dim)', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 0 }}
                labelStyle={{ color: 'var(--dim)', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                itemStyle={{ color: 'var(--warn)', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                formatter={v => [`${v?.toLocaleString()} mm³`]}
              />
              <Line
                dataKey="volume_mm3"
                stroke="var(--warn)"
                strokeWidth={2}
                dot={{ fill: 'var(--warn)', r: 3, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Survival curve */}
        <div className="panel p-6">
          <div className="label-tag mb-4">Projected 5-Year Survival Probability</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={survival}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)" />
              <XAxis
                dataKey="month"
                tickFormatter={v => `M${v}`}
                tick={{ fill: 'var(--dim)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fill: 'var(--dim)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 0 }}
                labelStyle={{ color: 'var(--dim)', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                itemStyle={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}
                formatter={(v, name) => [`${v}%`, name === 'survival_5yr' ? 'This patient' : 'Population avg']}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--dim)' }}
              />
              <Line
                dataKey="survival_5yr"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
                name="This patient"
              />
              <Line
                dataKey="population_avg"
                stroke="var(--dim)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="Population avg"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Timeline table */}
      <div className="panel p-6">
        <div className="label-tag mb-4">Projected Timeline & Recommended Actions</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Timepoint', 'Nodule Prob.', 'Volume (mm³)', 'Risk Level', 'Recommended Action'].map(h => (
                  <th key={h} className="label-tag text-left py-2 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Baseline */}
              <tr className="border-b border-border/50" style={{ background: 'rgba(0,212,255,0.04)' }}>
                <td className="mono py-2.5 px-3 text-accent">Now (baseline)</td>
                <td className="mono py-2.5 px-3">{(analysis.prediction.nodule_probability * 100).toFixed(1)}%</td>
                <td className="mono py-2.5 px-3">{analysis.geometry.volume_mm3.toLocaleString()}</td>
                <td className="py-2.5 px-3">
                  <RiskBadge level={currentRisk} />
                </td>
                <td className="py-2.5 px-3 text-dim">Current assessment</td>
              </tr>
              {points.map((p, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-white/3 transition-colors">
                  <td className="mono py-2.5 px-3 text-black">+{p.month} months</td>
                  <td className="mono py-2.5 px-3">
                    <span style={{ color: p.nodule_probability > THRESHOLD ? 'var(--pulse)' : 'var(--text)' }}>
                      {(p.nodule_probability * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="mono py-2.5 px-3">{p.volume_mm3.toLocaleString()}</td>
                  <td className="py-2.5 px-3">
                    <RiskBadge level={p.risk_level} />
                  </td>
                  <td className="py-2.5 px-3 text-dim">{p.recommended_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="panel p-4 flex items-start gap-3"
        style={{ borderColor: 'rgba(255,170,0,0.2)', background: 'rgba(255,170,0,0.03)' }}>
        <AlertTriangle size={14} className="text-warn mt-0.5 flex-shrink-0" />
        <p className="text-dim text-xs leading-relaxed">
          <strong className="text-warn">Research Use Only.</strong> These projections are generated by a
          machine learning model trained on the LUNA16 dataset and are for research purposes only.
          Survival curves use simplified Kaplan-Meier approximations. Not validated for clinical diagnosis
          or treatment planning. All findings must be reviewed by a qualified radiologist.
          Confidence intervals do not account for treatment interventions.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="panel p-5 corner-accent">
      <div className="flex items-start justify-between mb-2">
        <span className="label-tag">{label}</span>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="font-display text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="label-tag mt-1">{sub}</div>
    </div>
  )
}

function RiskBadge({ level }) {
  const color = level === 'HIGH' ? 'var(--pulse)' :
                level === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'
  return (
    <span className="mono text-xs px-2 py-0.5"
      style={{ color, border: `1px solid ${color}40`, background: `${color}10` }}>
      {level}
    </span>
  )
}

function LegendItem({ color, label, dashed, solid = true }) {
  return (
    <div className="flex items-center gap-1.5">
      {solid ? (
        <div className="w-5 h-0.5" style={{
          background: dashed ? 'none' : color,
          borderTop: dashed ? `1px dashed ${color}` : 'none',
        }} />
      ) : (
        <div className="w-5 h-3 rounded-sm" style={{ background: color }} />
      )}
      <span className="text-dim" style={{ fontSize: '10px', fontFamily: 'JetBrains Mono' }}>{label}</span>
    </div>
  )
}

function ProbTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="panel p-3 text-xs space-y-1.5" style={{ minWidth: '180px' }}>
      <div className="mono text-accent border-b border-border pb-1.5">{label}</div>
      <div className="flex justify-between">
        <span className="text-dim">Probability</span>
        <span className="mono text-black">{(d.nodule_probability * 100).toFixed(1)}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dim">95% CI</span>
        <span className="mono text-black">
          [{(d.confidence_lower * 100).toFixed(0)}–{(d.confidence_upper * 100).toFixed(0)}%]
        </span>
      </div>
      {d.risk_level && (
        <div className="flex justify-between">
          <span className="text-dim">Risk</span>
          <span className="mono" style={{
            color: d.risk_level === 'HIGH' ? 'var(--pulse)' :
                   d.risk_level === 'MEDIUM' ? 'var(--warn)' : 'var(--safe)'
          }}>{d.risk_level}</span>
        </div>
      )}
      {d.recommended_action && (
        <div className="pt-1.5 border-t border-border text-dim" style={{ fontSize: '9px' }}>
          {d.recommended_action}
        </div>
      )}
    </div>
  )
}
