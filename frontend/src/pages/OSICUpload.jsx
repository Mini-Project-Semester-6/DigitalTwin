import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, User, Activity, CheckCircle, AlertCircle, Cpu } from 'lucide-react'
import osicApi from '../lib/osicApi'

export default function OSICUpload() {
  const navigate = useNavigate()
  const [phase,    setPhase]    = useState('idle')
  const [progress, setProgress] = useState(0)
  const [stage,    setStage]    = useState('')
  const [stageLog, setStageLog] = useState([])
  const [error,    setError]    = useState('')
  const [file,     setFile]     = useState(null)
  const [meta,     setMeta]     = useState({
    age: '', gender: 'Male', smoker: 'Ex-smoker', base_fvc: '', pct: ''
  })

  const addLog = msg => setStageLog(p => [...p, { msg, t: new Date().toLocaleTimeString() }])

  const processFile = useCallback(async (f) => {
    setFile(f); setError(''); setStageLog([])
    try {
      setPhase('uploading')
      addLog(`File: ${f.name} (${(f.size/1024).toFixed(1)} KB)`)
      const { scanId, fileName } = await osicApi.uploadScan(f, {}, p => setProgress(p))
      addLog('Upload complete ✓')

      setPhase('processing'); setProgress(0)
      const metaClean = {
        age:      meta.age      ? +meta.age      : undefined,
        base_fvc: meta.base_fvc ? +meta.base_fvc : undefined,
        pct:      meta.pct      ? +meta.pct       : undefined,
        gender:   meta.gender,
        smoker:   meta.smoker,
      }
      const analysis = await osicApi.analyzeScan(scanId, fileName, metaClean, s => {
        setStage(s); addLog(s); setProgress(p => Math.min(95, p+10))
      })
      addLog('Analysis complete ✓'); setProgress(100); setPhase('done')
      setTimeout(() => navigate(`/osic/analysis/${scanId}`), 1000)
    } catch (err) {
      setError(err.message || 'Processing failed'); setPhase('error')
    }
  }, [navigate, meta])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: files => files[0] && processFile(files[0]),
    multiple: false,
    noClick: phase !== 'idle' && phase !== 'error',
  })

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <div className="label-tag mb-1">OSIC Pulmonary Fibrosis</div>
        <h2 className="font-display text-2xl font-bold text-black">Upload CT Scan</h2>
      </div>

      {/* Metadata form */}
      {(phase === 'idle' || phase === 'error') && (
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={13} className="text-accent" />
            <span className="label-tag">Patient Metadata (optional — improves predictions)</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key:'age',      label:'Age',          type:'number', placeholder:'e.g. 68' },
              { key:'base_fvc', label:'Baseline FVC',  type:'number', placeholder:'e.g. 2315 mL' },
              { key:'pct',      label:'FVC%',          type:'number', placeholder:'e.g. 58.3' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <div className="label-tag mb-1">{label}</div>
                <input
                  type={type}
                  value={meta[key]}
                  onChange={e => setMeta(m => ({...m, [key]: e.target.value}))}
                  placeholder={placeholder}
                  className="w-full bg-black/30 border border-border px-3 py-2 text-sm text-black mono outline-none focus:border-accent transition-colors"
                />
              </div>
            ))}
            <div>
              <div className="label-tag mb-1">Gender</div>
              <select value={meta.gender} onChange={e => setMeta(m => ({...m, gender: e.target.value}))}
                className="w-full bg-black/30 border border-border px-3 py-2 text-sm text-black mono outline-none focus:border-accent">
                <option>Male</option><option>Female</option>
              </select>
            </div>
            <div>
              <div className="label-tag mb-1">Smoking Status</div>
              <select value={meta.smoker} onChange={e => setMeta(m => ({...m, smoker: e.target.value}))}
                className="w-full bg-black/30 border border-border px-3 py-2 text-sm text-black mono outline-none focus:border-accent">
                <option>Never smoked</option><option>Ex-smoker</option><option>Currently smokes</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Dropzone */}
      {(phase === 'idle' || phase === 'error') && (
        <div {...getRootProps()}
          className={`upload-zone panel p-14 flex flex-col items-center gap-4 text-center ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          <div className="relative">
            <div className="w-16 h-16 border flex items-center justify-center"
              style={{ borderColor: isDragActive ? 'var(--accent)' : 'var(--dim)' }}>
              <Upload size={26} style={{ color: isDragActive ? 'var(--accent)' : 'var(--dim)' }} />
            </div>
            {isDragActive && <div className="absolute inset-0 border border-accent animate-ping opacity-40" />}
          </div>
          <div>
            <p className="text-black font-medium mb-1">
              {isDragActive ? 'Release to upload' : 'Drop CT scan or PNG slice here'}
            </p>
            <p className="text-dim text-sm">Accepts .png, .dcm, .mhd, .mha, .nii</p>
          </div>
          {phase === 'error' && (
            <div className="flex items-center gap-2 text-pulse text-sm">
              <AlertCircle size={13} />{error}
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {(phase === 'uploading' || phase === 'processing') && (
        <div className="panel p-6 space-y-4 corner-accent panel-accent">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 border border-accent flex items-center justify-center">
              <Cpu size={14} className="text-accent" />
              <div className="absolute inset-0 border border-accent animate-ping opacity-30" />
            </div>
            <div>
              <div className="text-black font-medium">
                {phase === 'uploading' ? 'Uploading' : 'OSIC Digital Twin Pipeline'}
              </div>
              <div className="label-tag mono" style={{fontSize:'0.65rem'}}>{stage || 'Initialising...'}</div>
            </div>
            <div className="ml-auto mono text-accent text-sm">{progress}%</div>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{width:`${progress}%`}} /></div>
          <div className="bg-black/40 p-3 h-36 overflow-y-auto font-mono text-xs space-y-1">
            {stageLog.map((e,i) => (
              <div key={i} className="flex gap-3">
                <span style={{color:'var(--dim)'}}>{e.t}</span>
                <span style={{color: i===stageLog.length-1 ? 'var(--accent)' : 'var(--text)'}}>
                  {i===stageLog.length-1 && '▶ '}{e.msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="panel p-10 flex flex-col items-center gap-3 text-center"
          style={{borderColor:'rgba(0,255,136,0.3)'}}>
          <CheckCircle size={44} className="text-safe" />
          <div className="font-display text-xl font-bold text-black">Analysis Complete</div>
          <div className="text-dim text-sm">Redirecting to results...</div>
        </div>
      )}
    </div>
  )
}
