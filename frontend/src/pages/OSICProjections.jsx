import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingDown, AlertTriangle, Calendar, Activity } from 'lucide-react'
import osicApi from '../lib/osicApi'

const STAGE_CFG = {
  0: { color:'var(--safe)',  label:'Mild' },
  1: { color:'var(--warn)',  label:'Moderate' },
  2: { color:'var(--pulse)', label:'Severe' },
}

export default function OSICProjections() {
  const { scanId } = useParams()
  const navigate   = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    const a = osicApi.getAnalysis(scanId)
    if (!a) navigate('/osic/upload')
    else setData(a)
  }, [scanId, navigate])

  if (!data) return null

  const { prediction, trajectory, survival, patient, fileName } = data
  const cfg = STAGE_CFG[prediction.stage]

  // Full timeline: observed + forecast
  const allPoints = [
    ...trajectory.observed.map(p => ({...p, source:'observed', fvc_upper:null, fvc_lower:null})),
    ...trajectory.forecast,
  ]
  const splitWeek = trajectory.observed[trajectory.observed.length-1].week

  // Recommended actions per forecast step
  const actions = trajectory.forecast.map(p => {
    const pct = p.fvc_pct
    if (pct < 40) return 'Lung transplant evaluation'
    if (pct < 50) return 'Specialist urgent review + oxygen therapy'
    if (pct < 65) return 'Antifibrotic therapy adjustment'
    if (pct < 80) return '6-week follow-up CT + PFT'
    return '3-month surveillance'
  })

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <div className="label-tag mb-1">OSIC — FVC Decline Projections</div>
          <h2 className="font-display text-2xl font-bold text-black">
            Pulmonary Fibrosis Trajectory Forecast
          </h2>
          <div className="label-tag mt-1 truncate max-w-lg">{fileName}</div>
        </div>
        <button onClick={() => navigate(`/osic/analysis/${scanId}`)}
          className="btn-neon" style={{borderColor:'var(--dim)',color:'var(--dim)'}}>
          <span>← Back to Analysis</span>
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Current FVC%',    value:`${prediction.fvcPct.toFixed(1)}%`,  color: cfg.color, icon: Activity },
          { label:'Disease Stage',   value: cfg.label,                           color: cfg.color, icon: AlertTriangle },
          { label:'12-Week Forecast',
            value:`${trajectory.forecast[1]?.fvc_pct?.toFixed(1)}%`,
            color:'var(--warn)', icon: TrendingDown },
          { label:'Recommended',
            value: actions[0].split(' ').slice(0,2).join(' '),
            color:'var(--accent)', icon: Calendar },
        ].map(({label,value,color,icon:Icon}) => (
          <div key={label} className="panel p-5 corner-accent">
            <div className="flex justify-between items-start mb-2">
              <span className="label-tag">{label}</span>
              <Icon size={13} style={{color}}/>
            </div>
            <div className="font-display text-2xl font-bold" style={{color}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Main FVC chart */}
      <div className="panel p-6">
        <div className="label-tag mb-1">FVC Decline Trajectory — LSTM Forecast</div>
        <div className="text-black text-sm mb-3">
          Forced vital capacity (mL) · EfficientNet-B0 + Attention-LSTM · 95% confidence band
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={allPoints}>
            <defs>
              <linearGradient id="obsA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
            <XAxis dataKey="week" tickFormatter={v=>`W${v}`}
              tick={{fill:'var(--dim)',fontSize:11,fontFamily:'JetBrains Mono'}}/>
            <YAxis tick={{fill:'var(--dim)',fontSize:11,fontFamily:'JetBrains Mono'}}/>
            <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:0}}
              labelFormatter={v=>`Week ${v}`}
              labelStyle={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--dim)'}}
              formatter={(v,n)=>[v?.toLocaleString?.() ?? v, n]}/>
            <ReferenceLine x={splitWeek} stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
              label={{value:'Forecast start',fill:'var(--dim)',fontSize:9,position:'top'}}/>
            {/* CI band */}
            <Area dataKey="fvc_upper" stroke="none"
              fill="rgba(255,51,102,0.07)" activeDot={false}/>
            <Area dataKey="fvc_lower" stroke="none"
              fill="var(--void)" activeDot={false}/>
            {/* Main */}
            <Area dataKey="fvc" stroke="var(--accent)" strokeWidth={2.5}
              fill="url(#obsA)"
              dot={d => d.payload.source === 'observed'
                ? <circle key={d.key} cx={d.cx} cy={d.cy} r={4} fill="var(--accent)"/>
                : <circle key={d.key} cx={d.cx} cy={d.cy} r={4} fill="var(--pulse)"
                    stroke="var(--void)" strokeWidth={1}/>}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* FVC% + survival */}
      <div className="grid grid-cols-2 gap-5">
        <div className="panel p-5">
          <div className="label-tag mb-1">FVC% Decline</div>
          <div className="text-dim text-xs mb-3">
            Clinical thresholds: ≥80% mild · 50-79% moderate · &lt;50% severe
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={allPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
              <XAxis dataKey="week" tickFormatter={v=>`W${v}`}
                tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
              <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`}
                tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
              <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:0}}
                labelFormatter={v=>`Week ${v}`}
                formatter={v=>[`${v?.toFixed?.(1) ?? v}%`]}
                labelStyle={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--dim)'}}/>
              <ReferenceLine y={80} stroke="var(--safe)"  strokeDasharray="3 3" strokeOpacity={0.5}
                label={{value:'Mild',fill:'var(--safe)',fontSize:9,position:'right'}}/>
              <ReferenceLine y={50} stroke="var(--warn)"  strokeDasharray="3 3" strokeOpacity={0.5}
                label={{value:'Mod',fill:'var(--warn)',fontSize:9,position:'right'}}/>
              <ReferenceLine x={splitWeek} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4"/>
              <Line dataKey="fvc_pct" stroke="var(--accent)" strokeWidth={2}
                dot={d => d.payload.source==='observed'
                  ? <circle key={d.key} cx={d.cx} cy={d.cy} r={3} fill="var(--accent)"/>
                  : <circle key={d.key} cx={d.cx} cy={d.cy} r={3} fill="var(--pulse)"/>}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel p-5">
          <div className="label-tag mb-1">5-Year Survival Estimate</div>
          <div className="text-dim text-xs mb-3">Kaplan-Meier approximation vs population average</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={survival}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
              <XAxis dataKey="month" tickFormatter={v=>`M${v}`}
                tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
              <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`}
                tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
              <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:0}}
                labelFormatter={v=>`Month ${v}`}
                formatter={(v,n)=>[`${v}%`, n==='survival'?'This patient':'Population']}
                labelStyle={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--dim)'}}/>
              <Line dataKey="survival"   stroke="var(--accent)" strokeWidth={2} dot={false} name="survival"/>
              <Line dataKey="population" stroke="var(--dim)"    strokeWidth={1.5}
                strokeDasharray="4 4" dot={false} name="population"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Timeline table */}
      <div className="panel p-5">
        <div className="label-tag mb-4">Forecast Timeline & Recommended Actions</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Timepoint','FVC (mL)','FVC%','95% CI (mL)','Stage','Action'].map(h => (
                  <th key={h} className="label-tag text-left py-2 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Baseline */}
              <tr className="border-b border-border/50" style={{background:'rgba(0,212,255,0.03)'}}>
                <td className="mono py-2.5 px-3 text-accent">Now (W{trajectory.observed[7].week})</td>
                <td className="mono py-2.5 px-3">{trajectory.observed[7].fvc.toLocaleString()}</td>
                <td className="mono py-2.5 px-3">{trajectory.observed[7].fvc_pct.toFixed(1)}%</td>
                <td className="mono py-2.5 px-3 text-dim">—</td>
                <td className="py-2.5 px-3"><StageBadge pct={trajectory.observed[7].fvc_pct}/></td>
                <td className="py-2.5 px-3 text-dim">Current baseline</td>
              </tr>
              {trajectory.forecast.map((p,i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-black/3 transition-colors">
                  <td className="mono py-2.5 px-3 text-black">W{p.week}</td>
                  <td className="mono py-2.5 px-3">{p.fvc.toLocaleString()}</td>
                  <td className="mono py-2.5 px-3">
                    <span style={{color: p.fvc_pct<50?'var(--pulse)':p.fvc_pct<80?'var(--warn)':'var(--safe)'}}>
                      {p.fvc_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="mono py-2.5 px-3 text-dim">{p.fvc_lower}–{p.fvc_upper}</td>
                  <td className="py-2.5 px-3"><StageBadge pct={p.fvc_pct}/></td>
                  <td className="py-2.5 px-3 text-dim">{actions[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="panel p-4 flex items-start gap-3"
        style={{borderColor:'rgba(255,170,0,0.2)',background:'rgba(255,170,0,0.02)'}}>
        <AlertTriangle size={13} className="text-warn mt-0.5 flex-shrink-0"/>
        <p className="text-dim text-xs leading-relaxed">
          <strong className="text-warn">Research Use Only.</strong> Projections generated by the OSIC Digital Twin
          model (EfficientNet-B0 + Attention-LSTM) trained on the OSIC Pulmonary Fibrosis Preprocessed dataset.
          FVC forecasts use LSTM autoregressive rollout and include simplified uncertainty estimates.
          Not validated for clinical use. All findings must be reviewed by a qualified pulmonologist.
        </p>
      </div>
    </div>
  )
}

function StageBadge({ pct }) {
  const stage = pct >= 80 ? 0 : pct >= 50 ? 1 : 2
  const cfg   = STAGE_CFG[stage]
  return (
    <span className="mono text-xs px-2 py-0.5"
      style={{color:cfg.color, border:`1px solid ${cfg.color}40`, background:`${cfg.color}10`}}>
      {cfg.label}
    </span>
  )
}
