import { useEffect, useRef, useState, useCallback } from 'react'
import { RotateCcw, Play, Pause, Layers } from 'lucide-react'

const MODES = ['volume', 'mip', 'slice']
const MODE_LABELS = { volume: 'Volume', mip: 'MIP', slice: 'Axial Slice' }

export default function CTViewer3D({ volumeSlices }) {
  const canvasRef   = useRef(null)
  const stateRef    = useRef({
    rotX: -0.4, rotY: 0.3, zoom: 1.0,
    brightness: 1.2, contrast: 1.4,
    threshold: 0.18, sliceZ: 0.5,
    mode: 'volume', dragging: false,
    lastX: 0, lastY: 0, autoRotate: false,
    rafId: null, renderPending: false,
  })
  const volumeRef   = useRef(null)
  const [mode,      setModeState]  = useState('volume')
  const [autoRot,   setAutoRot]    = useState(false)
  const [rotXDisp,  setRotXDisp]   = useState('-22.9°')
  const [rotYDisp,  setRotYDisp]   = useState('17.2°')
  const [zoomDisp,  setZoomDisp]   = useState('1.00×')
  const [sliceDisp, setSliceDisp]  = useState('32')

  // Build Float32 3D volume from base64 PNG slice array
  useEffect(() => {
    if (!volumeSlices?.length) return
    const n   = volumeSlices.length
    const S   = 128
    const vol = new Float32Array(n * S * S)

    let loaded = 0
    volumeSlices.forEach((b64, zi) => {
      const img    = new Image()
      img.onload   = () => {
        const tmp  = document.createElement('canvas')
        tmp.width  = S; tmp.height = S
        const ctx  = tmp.getContext('2d')
        ctx.drawImage(img, 0, 0, S, S)
        const px   = ctx.getImageData(0, 0, S, S).data
        for (let y = 0; y < S; y++)
          for (let x = 0; x < S; x++)
            vol[zi * S * S + y * S + x] = px[(y * S + x) * 4] / 255
        if (++loaded === n) { volumeRef.current = { data: vol, W: S, H: S, D: n }; schedRender() }
      }
      img.src = `data:image/png;base64,${b64}`
    })
  }, [volumeSlices])

  function sampleVol(vx, vy, vz) {
    const v = volumeRef.current
    if (!v) return 0
    const xi = Math.max(0, Math.min(v.W - 1, Math.round(vx * (v.W - 1))))
    const yi = Math.max(0, Math.min(v.H - 1, Math.round(vy * (v.H - 1))))
    const zi = Math.max(0, Math.min(v.D - 1, Math.round(vz * (v.D - 1))))
    return v.data[zi * v.W * v.H + yi * v.W + xi]
  }

  const colorize = useCallback((val, m, brightness, contrast, threshold) => {
    const v = Math.min(1, Math.max(0, (val - 0.5) * contrast + 0.5) * brightness)
    if (m === 'mip') return [v * 0.3, v * 0.9, v, 1]
    if (v < 0.15) return [v * 0.2, v * 0.4, v * 0.6, v * 0.3]
    if (v < 0.4)  return [v * 0.6, v * 0.85, v, v * 0.6]
    if (v < 0.7)  return [v * 0.9, v * 0.6, v * 0.3, v * 0.8]
    return [1, v * 0.95, v * 0.85, v]
  }, [])

  function applyRot(rx, ry, v) {
    const cx = Math.cos(rx), sx = Math.sin(rx)
    const cy = Math.cos(ry), sy = Math.sin(ry)
    const [x, y, z] = v
    const y2 = y * cx - z * sx, z2 = y * sx + z * cx
    return [x * cy + z2 * sy, y2, -x * sy + z2 * cy]
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    const W = canvas.width, H = canvas.height
    const img = new ImageData(W, H)
    const pix = img.data
    const { rotX, rotY, zoom, brightness, contrast, threshold, sliceZ, mode: m } = s
    const steps = m === 'mip' ? 80 : 64

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const ndcX = (px / W - 0.5) * 2 / zoom
        const ndcY = (py / H - 0.5) * 2 / zoom * (H / W)
        const rd0  = applyRot(rotX, rotY, [ndcX * 0.6, -ndcY * 0.6, 1])
        const len  = Math.sqrt(rd0[0] ** 2 + rd0[1] ** 2 + rd0[2] ** 2)
        const rd   = [rd0[0] / len, rd0[1] / len, rd0[2] / len]
        const ro   = applyRot(rotX, rotY, [ndcX * 1.3, -ndcY * 1.3, -2.2])

        let accR = 0, accG = 0, accB = 0, accA = 0, maxVal = 0

        for (let si = 0; si < steps; si++) {
          const t  = si / steps * 3.0
          const wx = ro[0] + rd[0] * t
          const wy = ro[1] + rd[1] * t
          const wz = ro[2] + rd[2] * t
          const vx = (wx + 1) * 0.5, vy = (wy + 1) * 0.5, vz = (wz + 1) * 0.5
          if (vx < 0 || vx > 1 || vy < 0 || vy > 1 || vz < 0 || vz > 1) continue

          if (m === 'slice') {
            if (Math.abs(vz - sliceZ) < 0.016) {
              const val = sampleVol(vx, vy, sliceZ)
              const c = colorize(val, 'volume', brightness, contrast, threshold)
              accR = c[0] * 255; accG = c[1] * 255; accB = c[2] * 255; accA = 255
            }
            continue
          }

          const val = sampleVol(vx, vy, vz)
          if (val < threshold) continue
          if (m === 'mip') { if (val > maxVal) maxVal = val; continue }

          const c = colorize(val, 'volume', brightness, contrast, threshold)
          const alpha = c[3] * 0.18
          accR += (c[0] * 255 - accR) * alpha
          accG += (c[1] * 255 - accG) * alpha
          accB += (c[2] * 255 - accB) * alpha
          accA = Math.min(255, accA + alpha * 255)
        }

        if (m === 'mip' && maxVal > threshold) {
          const c = colorize(maxVal, 'mip', brightness, contrast, threshold)
          accR = c[0] * 255; accG = c[1] * 255; accB = c[2] * 255; accA = c[3] * 255
        }

        const idx = (py * W + px) * 4
        pix[idx]     = Math.min(255, accR | 0)
        pix[idx + 1] = Math.min(255, accG | 0)
        pix[idx + 2] = Math.min(255, accB | 0)
        pix[idx + 3] = Math.min(255, accA | 0)
      }
    }

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.putImageData(img, 0, 0)

    // Overlay text
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(0,212,200,0.75)'
    ctx.fillText(MODE_LABELS[m], 10, 18)
    ctx.fillStyle = 'rgba(0,180,160,0.5)'
    ctx.fillText(`Rx ${(s.rotX * 57.3).toFixed(1)}° Ry ${(s.rotY * 57.3).toFixed(1)}° Z ${s.zoom.toFixed(2)}×`, 10, 32)

    // Update display state
    setRotXDisp((s.rotX * 57.3).toFixed(1) + '°')
    setRotYDisp((s.rotY * 57.3).toFixed(1) + '°')
    setZoomDisp(s.zoom.toFixed(2) + '×')
    setSliceDisp(Math.round(s.sliceZ * (volumeRef.current?.D ?? 64)))
  }, [colorize, sampleVol])

  function schedRender() {
    const s = stateRef.current
    if (s.renderPending) return
    s.renderPending = true
    requestAnimationFrame(() => { render(); s.renderPending = false })
  }

  // Mouse / touch
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current

    const onDown  = e => { s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY }
    const onUp    = () => { s.dragging = false }
    const onMove  = e => {
      if (!s.dragging) return
      s.rotY += (e.clientX - s.lastX) * 0.008
      s.rotX += (e.clientY - s.lastY) * 0.008
      s.lastX = e.clientX; s.lastY = e.clientY
      schedRender()
    }
    const onWheel = e => {
      e.preventDefault()
      s.zoom = Math.max(0.3, Math.min(4, s.zoom - e.deltaY * 0.001))
      schedRender()
    }
    const onTDown = e => { s.dragging = true; s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY }
    const onTMove = e => {
      e.preventDefault()
      s.rotY += (e.touches[0].clientX - s.lastX) * 0.008
      s.rotX += (e.touches[0].clientY - s.lastY) * 0.008
      s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY
      schedRender()
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onTDown)
    canvas.addEventListener('touchmove',  onTMove, { passive: false })
    canvas.addEventListener('wheel',      onWheel, { passive: false })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('mousemove',  onMove)

    schedRender()
    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onTDown)
      canvas.removeEventListener('touchmove',  onTMove)
      canvas.removeEventListener('wheel',      onWheel)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('mousemove',  onMove)
    }
  }, [])

  function setMode(m) {
    stateRef.current.mode = m
    setModeState(m)
    schedRender()
  }

  function resetView() {
    Object.assign(stateRef.current, { rotX: -0.4, rotY: 0.3, zoom: 1.0 })
    schedRender()
  }

  function toggleAuto() {
    const s = stateRef.current
    s.autoRotate = !s.autoRotate
    setAutoRot(s.autoRotate)
    if (s.autoRotate) {
      const loop = () => {
        if (!stateRef.current.autoRotate) return
        stateRef.current.rotY += 0.012
        schedRender()
        s.rafId = requestAnimationFrame(loop)
      }
      loop()
    } else {
      cancelAnimationFrame(s.rafId)
    }
  }

  function handleSlider(key, val, transform) {
    stateRef.current[key] = transform ? transform(val) : val
    schedRender()
  }

  const sliceCount = volumeRef.current?.D ?? volumeSlices?.length ?? 64

  return (
    <div className="rounded-2xl p-6 space-y-4"
         style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={18} style={{ color: 'var(--cyan)' }} />
          <h3 className="font-display font-600 text-base">3D CT Reconstruction</h3>
        </div>
        <div className="flex gap-2 text-xs font-mono">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
                    className="px-3 py-1 rounded-lg transition-all"
                    style={{
                      background: mode === m ? 'rgba(0,212,232,0.15)' : 'var(--panel)',
                      border:     `1px solid ${mode === m ? 'var(--cyan)' : 'var(--rim)'}`,
                      color:      mode === m ? 'var(--cyan)' : '#7a94b0',
                    }}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden"
           style={{ background: '#000', border: '1px solid rgba(0,212,232,0.2)' }}>
        <canvas ref={canvasRef} width={620} height={340}
                style={{ display: 'block', width: '100%', cursor: 'grab' }} />
        <div className="absolute bottom-2 right-3 text-xs font-mono opacity-40"
             style={{ color: 'var(--cyan)' }}>
          drag · scroll · pinch
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-2">
        {[['Rotation X', rotXDisp], ['Rotation Y', rotYDisp],
          ['Zoom',       zoomDisp], ['Slice',      sliceDisp]].map(([label, val]) => (
          <div key={label} className="p-3 rounded-xl text-center"
               style={{ background: 'var(--panel)', border: '1px solid var(--rim)' }}>
            <p className="text-xs font-mono opacity-40 mb-1">{label}</p>
            <p className="font-display font-600 text-base" style={{ color: 'var(--cyan)' }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {[
          { label: 'Brightness', key: 'brightness', min: 0.2, max: 3,   step: 0.05, def: 1.2 },
          { label: 'Contrast',   key: 'contrast',   min: 0.2, max: 3,   step: 0.05, def: 1.4 },
          { label: 'Threshold',  key: 'threshold',  min: 0,   max: 0.9, step: 0.01, def: 0.18 },
        ].map(({ label, key, min, max, step, def }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs font-mono opacity-50 w-20 shrink-0">{label}</span>
            <input type="range" min={min} max={max} step={step} defaultValue={def}
                   className="flex-1"
                   onChange={e => handleSlider(key, parseFloat(e.target.value))} />
            <span className="text-xs font-mono w-10 text-right"
                  style={{ color: 'var(--cyan)' }}>
              {def.toFixed(2)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono opacity-50 w-20 shrink-0">Slice Z</span>
          <input type="range" min={0} max={sliceCount - 1} step={1}
                 defaultValue={Math.round(sliceCount / 2)} className="flex-1"
                 onChange={e => handleSlider('sliceZ', parseInt(e.target.value),
                                             v => v / (sliceCount - 1))} />
          <span className="text-xs font-mono w-10 text-right"
                style={{ color: 'var(--cyan)' }}>{sliceDisp}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button onClick={resetView}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-mono transition-all"
                style={{ background: 'var(--panel)', border: '1px solid var(--rim)',
                         color: '#7a94b0' }}>
          <RotateCcw size={13} /> Reset
        </button>
        <button onClick={toggleAuto}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-mono transition-all"
                style={{
                  background: autoRot ? 'rgba(0,212,232,0.12)' : 'var(--panel)',
                  border:     `1px solid ${autoRot ? 'var(--cyan)' : 'var(--rim)'}`,
                  color:      autoRot ? 'var(--cyan)' : '#7a94b0',
                }}>
          {autoRot ? <Pause size={13} /> : <Play size={13} />}
          {autoRot ? 'Stop' : 'Auto-rotate'}
        </button>
        <span className="ml-auto text-xs font-mono opacity-40 self-center">
          {sliceCount} slices · 128³ reconstructed
        </span>
      </div>
    </div>
  )
}