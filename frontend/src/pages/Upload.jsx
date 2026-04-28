import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload as UploadIcon, FileType, CheckCircle, AlertCircle, Cpu, Layers, GitBranch } from 'lucide-react'
import api from '../lib/api'

const ACCEPTED_TYPES = {
  'application/octet-stream': ['.mhd', '.raw', '.mha'],
  'application/dicom':        ['.dcm'],
  'image/nii':                ['.nii'],
}

const VALID_EXTENSIONS = ['.mhd', '.mha', '.nii', '.dcm', '.raw', '.nii.gz']

export default function Upload() {
  const navigate = useNavigate()
  const [phase, setPhase]     = useState('idle')     // idle | uploading | processing | done | error
  const [progress, setProgress] = useState(0)
  const [stage, setStage]     = useState('')
  const [stageLog, setStageLog] = useState([])
  const [error, setError]     = useState('')
  const [file, setFile]       = useState(null)

  const addLog = (msg) => setStageLog(prev => [...prev, { msg, t: new Date().toLocaleTimeString() }])

  const processFile = useCallback(async (f) => {
    setFile(f)
    setError('')
    setStageLog([])

    // Validate extension
    const name = f.name.toLowerCase()
    const valid = VALID_EXTENSIONS.some(ext => name.endsWith(ext)) ||
                  f.name.toLowerCase().match(/ct|scan|lung|mhd|mha|dicom|dcm/)

    if (!valid) {
      setError(`"${f.name}" does not appear to be a CT scan file. Please upload .mhd, .mha, .nii, .dcm, or .raw files.`)
      setPhase('error')
      return
    }

    try {
      // Upload
      setPhase('uploading')
      addLog(`Received: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)
      const { scanId, fileName } = await api.uploadScan(f, (p) => {
        setProgress(p)
        if (p === 50) addLog('Transfer 50%...')
      })
      addLog('Upload complete ✓')

      // Processing
      setPhase('processing')
      setProgress(0)
      addLog('Initialising digital twin pipeline...')

      const analysis = await api.analyzeScan(scanId, fileName, (s) => {
        setStage(s)
        addLog(s)
        setProgress(prev => Math.min(95, prev + 11))
      })

      api.saveAnalysis(analysis)
      addLog('Analysis complete ✓')
      setProgress(100)
      setPhase('done')

      setTimeout(() => navigate(`/analysis/${scanId}`), 1200)

    } catch (err) {
      setError(err.message || 'Processing failed')
      setPhase('error')
    }
  }, [navigate])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: files => files[0] && processFile(files[0]),
    multiple: false,
    noClick: phase !== 'idle' && phase !== 'error',
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="label-tag mb-1">New Analysis</div>
        <h2 className="font-display text-2xl font-bold text-black">Upload CT Scan</h2>
        <p className="text-dim text-sm mt-1">
          Accepts .mhd, .mha, .nii, .dcm, .raw
        </p>
      </div>

      {/* Drop zone */}
      {(phase === 'idle' || phase === 'error') && (
        <div
          {...getRootProps()}
          className={`upload-zone panel p-16 flex flex-col items-center gap-4 text-center ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="relative">
            <div
              className="w-20 h-20 border flex items-center justify-center"
              style={{ borderColor: isDragActive ? 'var(--accent)' : 'var(--dim)' }}
            >
              <UploadIcon size={32} style={{ color: isDragActive ? 'var(--accent)' : 'var(--dim)' }} />
            </div>
            {isDragActive && (
              <>
                <div className="absolute inset-0 border border-accent animate-ping opacity-40" />
                <div className="absolute inset-0 border border-accent animate-pulse opacity-20" />
              </>
            )}
          </div>

          <div>
            <p className="text-black font-medium mb-1">
              {isDragActive ? 'Release to upload' : 'Drop CT scan file here'}
            </p>
            <p className="text-dim text-sm">or click to browse</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {VALID_EXTENSIONS.map(ext => (
              <span key={ext} className="mono text-xs px-2 py-1 border border-border text-dim">
                {ext}
              </span>
            ))}
          </div>

          {phase === 'error' && (
            <div className="flex items-center gap-2 text-pulse text-sm mt-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Upload progress */}
      {phase === 'uploading' && (
        <ProcessPanel
          title="Uploading scan"
          icon={Upload}
          progress={progress}
          log={stageLog}
          stage="Transferring file..."
        />
      )}

      {/* Processing */}
      {phase === 'processing' && (
        <ProcessPanel
          title="Digital twin pipeline running"
          icon={Cpu}
          progress={progress}
          log={stageLog}
          stage={stage}
        />
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="panel p-10 flex flex-col items-center gap-4 text-center border-safe" style={{ borderColor: 'rgba(0,255,136,0.3)' }}>
          <CheckCircle size={48} className="text-safe" />
          <div>
            <div className="font-display text-xl font-bold text-black">Analysis Complete</div>
            <div className="text-dim text-sm mt-1">Redirecting to results...</div>
          </div>
        </div>
      )}

      {/* Accepted formats info */}
      {phase === 'idle' && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: FileType, title: 'MHD / MHA',  desc: 'MetaImage format — LUNA16 default. Both .mhd + .raw required.' },
            { icon: Layers,   title: 'NIfTI',       desc: '.nii or .nii.gz — common neuroimaging & CT format.' },
            { icon: GitBranch, title: 'DICOM .dcm', desc: 'Standard clinical CT format. Single or series supported.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="panel p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-accent" />
                <span className="mono text-xs text-accent">{title}</span>
              </div>
              <p className="text-dim text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProcessPanel({ title, icon: Icon, progress, log, stage }) {
  return (
    <div className="panel p-6 space-y-5 corner-accent panel-accent">
      <div className="flex items-center gap-3">
        <div className="relative w-8 h-8 border border-accent flex items-center justify-center">
          <Icon size={16} className="text-accent" />
          <div className="absolute inset-0 border border-accent animate-ping opacity-30" />
        </div>
        <div>
          <div className="text-black font-medium">{title}</div>
          <div className="label-tag mono" style={{ fontSize: '0.65rem' }}>{stage}</div>
        </div>
        <div className="ml-auto mono text-accent text-sm">{progress}%</div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Stage log */}
      <div className="bg-black/40 p-3 h-40 overflow-y-auto font-mono text-xs space-y-1">
        {log.map((entry, i) => (
          <div key={i} className="flex gap-3">
            <span style={{ color: 'var(--dim)' }}>{entry.t}</span>
            <span style={{ color: i === log.length - 1 ? 'var(--accent)' : 'var(--text)' }}>
              {i === log.length - 1 && '▶ '}{entry.msg}
            </span>
          </div>
        ))}
        {log.length === 0 && <span className="text-dim">Initialising...</span>}
      </div>
    </div>
  )
}
