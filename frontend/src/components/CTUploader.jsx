import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FolderOpen, X } from 'lucide-react'

export default function CTUploader({ files, setFiles }) {
  const onDrop = useCallback(accepted => {
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !names.has(f.name))]
    })
  }, [setFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept DICOM files and plain images
    accept: {
      'application/dicom':    ['.dcm', '.dicom'],
      'image/*':              ['.png', '.jpg', '.jpeg', '.tiff', '.bmp'],
      'application/octet-stream': ['.dcm'],   // some OS sends DCM as octet-stream
    },
    multiple: true,
  })

  const remove = (name) =>
    setFiles(prev => prev.filter(f => f.name !== name))

  const isDcm = files.length > 0 &&
    files[0].name.toLowerCase().endsWith('.dcm')

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className="relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300"
        style={{
          borderColor: isDragActive ? 'var(--cyan)' : 'var(--rim)',
          background:  isDragActive ? 'rgba(0,212,232,0.06)' : 'var(--card)',
          boxShadow:   isDragActive ? '0 0 32px rgba(0,212,232,0.12)' : 'none',
        }}>
        <input {...getInputProps()} />

        {/* Also support folder selection via a separate input */}
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-full"
               style={{ background: 'rgba(0,212,232,0.1)',
                        border: '1px solid rgba(0,212,232,0.3)' }}>
            {isDragActive
              ? <FolderOpen size={28} style={{ color: 'var(--cyan)' }} />
              : <Upload    size={28} style={{ color: 'var(--cyan)' }} />
            }
          </div>

          <div>
            <p className="font-display font-600 text-base"
               style={{ color: isDragActive ? 'var(--cyan)' : '#e2eaf4' }}>
              {isDragActive
                ? 'Drop DICOM folder or image slices…'
                : 'Upload CT Scan — DICOM or PNG slices'}
            </p>
            <p className="text-sm opacity-50 mt-1">
              Drag & drop a <strong>.dcm</strong> folder · or PNG / JPEG slices
            </p>
          </div>

          {/* Folder picker button */}
          <label
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-mono cursor-pointer transition-all"
            style={{ background: 'var(--panel)', border: '1px solid var(--rim)',
                     color: 'var(--cyan)' }}
            onClick={e => e.stopPropagation()}>
            <FolderOpen size={14} />
            Browse Folder
            <input
              type="file"
              multiple
              // webkitdirectory lets user select an entire folder
              webkitdirectory=""
              directory=""
              accept=".dcm,.dicom,.png,.jpg,.jpeg,.tiff,.bmp"
              className="hidden"
              onChange={e => {
                const accepted = Array.from(e.target.files || [])
                setFiles(prev => {
                  const names = new Set(prev.map(f => f.name))
                  return [...prev, ...accepted.filter(f => !names.has(f.name))]
                })
                e.target.value = ''   // reset so same folder can be reselected
              }}
            />
          </label>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono opacity-40">
              {files.length} slice{files.length > 1 ? 's' : ''} queued
              {isDcm && (
                <span className="ml-2 px-2 py-0.5 rounded"
                      style={{ background: 'rgba(0,212,232,0.15)',
                               color: 'var(--cyan)' }}>
                  DICOM · HU windowing applied
                </span>
              )}
            </p>
            <button
              onClick={() => setFiles([])}
              className="text-xs font-mono opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--coral)' }}>
              clear all
            </button>
          </div>

          {files.map((f, i) => (
            <div key={f.name}
                 className="flex items-center justify-between px-3 py-2 rounded-lg"
                 style={{ background: 'var(--panel)',
                          border: '1px solid var(--rim)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono opacity-40 w-5 shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs font-mono shrink-0 px-1.5 py-0.5 rounded"
                      style={{
                        background: f.name.toLowerCase().endsWith('.dcm')
                          ? 'rgba(0,212,232,0.15)' : 'rgba(155,138,255,0.15)',
                        color: f.name.toLowerCase().endsWith('.dcm')
                          ? 'var(--cyan)' : 'var(--lavender)',
                      }}>
                  {f.name.toLowerCase().endsWith('.dcm') ? 'DCM' : 'IMG'}
                </span>
                <span className="text-sm truncate">{f.name}</span>
                <span className="text-xs font-mono opacity-40 shrink-0">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                onClick={() => remove(f.name)}
                className="ml-3 p-1 rounded opacity-40 hover:opacity-100 transition-opacity">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}