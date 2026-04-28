import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { Activity, TrendingDown, AlertTriangle, ChevronRight, User } from 'lucide-react'
import osicApi from '../lib/osicApi'
import CTViewer from '../components/CTViewer'

const STAGE_CFG = {
  0: { color:'var(--safe)',  label:'Mild',     border:'rgba(0,255,136,0.3)' },
  1: { color:'var(--warn)',  label:'Moderate', border:'rgba(255,170,0,0.3)' },
  2: { color:'var(--pulse)', label:'Severe',   border:'rgba(255,51,102,0.3)' },
}

export default function OSICAnalysis() {
  const { scanId } = useParams()
  const navigate   = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    const a = osicApi.getAnalysis(scanId)
    if (!a) navigate('/osic/upload')
    else setData(a)
  }, [scanId, navigate])

  if (!data) return null

  const { prediction, patient, trajectory, survival, fileName, timestamp } = data
  const cfg = STAGE_CFG[prediction.stage]

  // Combine observed + forecast for the main chart
  const obsPoints = trajectory.observed.map(p => ({
    week: p.week, fvc: p.fvc, fvc_pct: p.fvc_pct,
    type: 'observed',
  }))
  const fcPoints = trajectory.forecast.map(p => ({
    week: p.week, fvc: p.fvc, fvc_pct: p.fvc_pct,
    fvc_upper: p.fvc_upper, fvc_lower: p.fvc_lower,
    pct_upper: p.pct_upper, pct_lower: p.pct_lower,
    type: 'forecast',
  }))
  const allPoints = [...obsPoints, ...fcPoints]
  const splitWeek = obsPoints[obsPoints.length-1].week

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="label-tag mb-1">Pulmonary Fibrosis Analysis</div>
          <h2 className="font-display text-2xl font-bold text-black truncate max-w-lg">{fileName}</h2>
          <div className="label-tag mt-1">{new Date(timestamp).toLocaleString()} · {data.model}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/osic/projections/${scanId}`)} className="btn-neon">
            <span>FVC Projections →</span>
          </button>
          <button onClick={() => navigate('/osic/upload')}
            className="btn-neon" style={{borderColor:'var(--dim)',color:'var(--dim)'}}>
            <span>New Scan</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* LEFT: CT viewer + patient info */}
        <div className="space-y-4">
          <CTViewer analysis={data} />

          {/* Patient card */}
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <User size={13} className="text-accent" />
              <span className="label-tag">Patient Profile</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2">
              {[
                ['Age',          patient.age],
                ['Gender',       patient.gender],
                ['Smoking',      patient.smoker],
                ['Baseline FVC', `${patient.baseFVC} mL`],
              ].map(([k,v]) => (
                <div key={k}>
                  <div className="label-tag">{k}</div>
                  <div className="mono text-xs text-black">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage card */}
          <div className="panel p-5 corner-accent" style={{borderColor: cfg.border}}>
            <div className="label-tag mb-2">Disease Stage</div>
            <div className="font-display text-3xl font-bold mb-3" style={{color: cfg.color}}>
              {cfg.label}
            </div>
            <div className="space-y-2">
              {['Mild','Moderate','Severe'].map((s,i) => (
                <div key={s}>
                  <div className="flex justify-between mb-0.5">
                    <span className="label-tag">{s}</span>
                    <span className="mono text-xs" style={{color: STAGE_CFG[i].color}}>
                      {(prediction.stageProbs[i]*100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-black/40">
                    <div className="h-full transition-all duration-700"
                      style={{width:`${prediction.stageProbs[i]*100}%`, background: STAGE_CFG[i].color,
                              boxShadow:`0 0 6px ${STAGE_CFG[i].color}`}} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTRE: FVC trajectory */}
        <div className="col-span-2 space-y-4">

          {/* Key metrics */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label:'FVC%',        value:`${prediction.fvcPct.toFixed(1)}%`, color: cfg.color },
              { label:'AUC-ROC',     value: prediction.auc,                    color:'var(--accent)' },
              { label:'F1-Score',    value: prediction.f1,                     color:'var(--accent)' },
              { label:'FVC MAE',     value:`${prediction.mae.toFixed(1)}%`,    color:'var(--warn)' },
            ].map(({label,value,color}) => (
              <div key={label} className="panel p-4 corner-accent">
                <div className="label-tag mb-1">{label}</div>
                <div className="font-display text-2xl font-bold" style={{color}}>{value}</div>
              </div>
            ))}
          </div>

          {/* FVC trajectory chart */}
          <div className="panel p-5">
            <div className="label-tag mb-1">FVC Trajectory — Observed + Forecast</div>
            <div className="text-black text-sm font-medium mb-3">
              Forced Vital Capacity over time · LSTM digital twin forecast
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={allPoints}>
                <defs>
                  <linearGradient id="obsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--pulse)" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="var(--pulse)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
                <XAxis dataKey="week" tickFormatter={v=>`W${v}`}
                  tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
                <YAxis tick={{fill:'var(--dim)',fontSize:10,fontFamily:'JetBrains Mono'}}/>
                <Tooltip content={<FVCTooltip/>}/>
                <ReferenceLine x={splitWeek} stroke="rgba(255,255,255,0.2)"
                  strokeDasharray="4 4" label={{value:'Now',fill:'var(--dim)',fontSize:9}}/>
                {/* Confidence band */}
                <Area dataKey="fvc_upper" stroke="none"
                  fill="rgba(255,51,102,0.08)" activeDot={false}/>
                <Area dataKey="fvc_lower" stroke="none"
                  fill="var(--void)" activeDot={false}/>
                {/* Lines */}
                <Area dataKey="fvc" stroke="var(--accent)" strokeWidth={2}
                  fill="url(#obsGrad)"
                  dot={d => d.payload.type==='observed'
                    ? <circle key={d.key} cx={d.cx} cy={d.cy} r={3} fill="var(--accent)"/>
                    : <circle key={d.key} cx={d.cx} cy={d.cy} r={3} fill="var(--pulse)" strokeDasharray=""/>}
                  strokeDasharray={p => p?.type==='forecast' ? '4 4' : ''}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <LegItem color="var(--accent)" label="Observed FVC"/>
              <LegItem color="var(--pulse)"  label="Forecast FVC" dashed/>
              <LegItem color="rgba(255,51,102,0.2)" label="Uncertainty band" solid={false}/>
            </div>
          </div>

          {/* FVC% + survival side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="panel p-4">
              <div className="label-tag mb-3">FVC% Trajectory</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={allPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
                  <XAxis dataKey="week" tickFormatter={v=>`W${v}`}
                    tick={{fill:'var(--dim)',fontSize:9,fontFamily:'JetBrains Mono'}}/>
                  <YAxis tick={{fill:'var(--dim)',fontSize:9,fontFamily:'JetBrains Mono'}}/>
                  <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:0}}
                    labelStyle={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--dim)'}}
                    itemStyle={{fontFamily:'JetBrains Mono',fontSize:10}}
                    formatter={v=>[`${v?.toFixed(1)}%`]}/>
                  <ReferenceLine y={80} stroke="var(--safe)"   strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <ReferenceLine y={50} stroke="var(--warn)"   strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <Line dataKey="fvc_pct" stroke="var(--accent)" strokeWidth={2}
                    dot={d => d.payload.type==='forecast'
                      ? <circle key={d.key} cx={d.cx} cy={d.cy} r={2} fill="var(--pulse)"/>
                      : <circle key={d.key} cx={d.cx} cy={d.cy} r={2} fill="var(--accent)"/>}/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="panel p-4">
              <div className="label-tag mb-3">5-Year Survival</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={survival}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,34,64,0.8)"/>
                  <XAxis dataKey="month" tickFormatter={v=>`M${v}`}
                    tick={{fill:'var(--dim)',fontSize:9,fontFamily:'JetBrains Mono'}}/>
                  <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`}
                    tick={{fill:'var(--dim)',fontSize:9,fontFamily:'JetBrains Mono'}}/>
                  <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:0}}
                    labelStyle={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--dim)'}}
                    formatter={(v,n)=>[`${v}%`, n==='survival'?'This patient':'Population avg']}/>
                  <Legend wrapperStyle={{fontSize:'9px',fontFamily:'JetBrains Mono',color:'var(--dim)'}}/>
                  <Line dataKey="survival"   stroke="var(--accent)" strokeWidth={2} dot={false} name="survival"/>
                  <Line dataKey="population" stroke="var(--dim)"    strokeWidth={1.5}
                    strokeDasharray="4 4" dot={false} name="population"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model performance */}
          <div className="panel p-4">
            <div className="label-tag mb-3">Model Performance (OSIC DigitalTwin-v1)</div>
            <div className="grid grid-cols-4 gap-3">
              {[
                {label:'AUC-ROC',    value: prediction.auc,         bar: true, color:'var(--accent)'},
                {label:'F1-Score',   value: prediction.f1,          bar: true, color:'var(--accent)'},
                {label:'R² (FVC)',   value: prediction.r2,          bar: true, color:'var(--safe)'},
                {label:'Confidence', value: prediction.confidence,  bar: true, color:'var(--warn)'},
              ].map(({label,value,color}) => (
                <div key={label}>
                  <div className="flex justify-between mb-1">
                    <span className="label-tag">{label}</span>
                    <span className="mono text-xs" style={{color}}>{value.toFixed(3)}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill"
                      style={{width:`${value*100}%`, background:`linear-gradient(90deg,${color},${color}60)`}}/>
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

function LegItem({ color, label, dashed, solid=true }) {
  return (
    <div className="flex items-center gap-1.5">
      {solid
        ? <div className="w-5 h-0.5" style={{
            background: dashed ? 'none' : color,
            borderTop:  dashed ? `1px dashed ${color}` : 'none'
          }}/>
        : <div className="w-5 h-3 rounded-sm" style={{background:color}}/>
      }
      <span className="label-tag" style={{fontSize:'9px',fontFamily:'JetBrains Mono'}}>{label}</span>
    </div>
  )
}

function FVCTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="panel p-3 text-xs space-y-1" style={{minWidth:'150px'}}>
      <div className="mono text-accent border-b border-border pb-1">Week {label}</div>
      <div className="flex justify-between">
        <span className="text-dim">FVC</span>
        <span className="mono text-black">{d?.fvc?.toLocaleString()} mL</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dim">FVC%</span>
        <span className="mono text-black">{d?.fvc_pct?.toFixed(1)}%</span>
      </div>
      {d?.fvc_upper && (
        <div className="flex justify-between">
          <span className="text-dim">95% CI</span>
          <span className="mono text-dim">{d.fvc_lower}–{d.fvc_upper}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-dim">Type</span>
        <span className="mono" style={{color: d?.type==='forecast' ? 'var(--pulse)' : 'var(--accent)'}}>
          {d?.type}
        </span>
      </div>
    </div>
  )
}
