import { useState, useRef, useEffect } from 'react'

// Generates a convincing-looking CT lung slice canvas
function drawCTSlice(canvas, sliceData, scanId, sliceIdx) {
  const ctx   = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Black background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  // Seed from scanId + slice for deterministic patterns
  const seed  = (scanId?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 42) + sliceIdx * 17
  const rng   = (n) => ((seed * 9301 + 49297 * (n + 1)) % 233280) / 233280

  const cx = W / 2 + (rng(1) - 0.5) * W * 0.1
  const cy = H / 2 + (rng(2) - 0.5) * H * 0.1

  // Body outline (ellipse) — dark soft tissue
  const bodyRx = W * 0.38 + (rng(3) - 0.5) * W * 0.04
  const bodyRy = H * 0.44 + (rng(4) - 0.5) * H * 0.04
  const bodyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bodyRx, bodyRy))
  bodyGrad.addColorStop(0,   'rgba(80, 80, 80, 0.9)')
  bodyGrad.addColorStop(0.6, 'rgba(55, 55, 55, 0.8)')
  bodyGrad.addColorStop(1,   'rgba(20, 20, 20, 0.3)')
  ctx.fillStyle = bodyGrad
  ctx.beginPath()
  ctx.ellipse(cx, cy, bodyRx, bodyRy, rng(5) * 0.3, 0, Math.PI * 2)
  ctx.fill()

  // Chest wall (brighter ring)
  ctx.strokeStyle = 'rgba(160, 160, 160, 0.6)'
  ctx.lineWidth   = 3 + rng(6) * 3
  ctx.beginPath()
  ctx.ellipse(cx, cy, bodyRx, bodyRy, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Left lung
  const llx = cx - bodyRx * 0.28
  const lly = cy - bodyRy * 0.05
  const llRx = bodyRx * (0.28 + rng(7) * 0.08)
  const llRy = bodyRy * (0.42 + rng(8) * 0.06)
  drawLungLobe(ctx, llx, lly, llRx, llRy, rng(9), sliceData, 'left')

  // Right lung
  const rlx = cx + bodyRx * 0.28
  const rly = cy - bodyRy * 0.05
  const rlRx = bodyRx * (0.30 + rng(10) * 0.07)
  const rlRy = bodyRy * (0.44 + rng(11) * 0.06)
  drawLungLobe(ctx, rlx, rly, rlRx, rlRy, rng(12), sliceData, 'right')

  // Spine (bright ellipse centre-back)
  ctx.fillStyle = 'rgba(210, 210, 210, 0.85)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + bodyRy * 0.55, bodyRx * 0.06, bodyRy * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()

  // Sternum
  ctx.fillStyle = 'rgba(180, 180, 180, 0.6)'
  ctx.beginPath()
  ctx.ellipse(cx, cy - bodyRy * 0.55, bodyRx * 0.04, bodyRy * 0.055, 0, 0, Math.PI * 2)
  ctx.fill()

  // Trachea / carina if upper slice
  if (sliceIdx < 6) {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.9)'
    ctx.beginPath()
    ctx.ellipse(cx, cy - bodyRy * 0.15, bodyRx * 0.04, bodyRy * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Finding highlight (nodule)
  if (sliceData?.has_finding && sliceIdx >= 6 && sliceIdx < 14) {
    const fx  = rlx + (rng(13) - 0.5) * rlRx
    const fy  = rly + (rng(14) - 0.5) * rlRy * 0.6
    const fr  = 4 + rng(15) * 8
    const fg  = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.5)
    fg.addColorStop(0,   'rgba(255, 200, 100, 0.9)')
    fg.addColorStop(0.5, 'rgba(255, 100, 50,  0.5)')
    fg.addColorStop(1,   'rgba(255, 50,  50,  0)')
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.arc(fx, fy, fr * 2.5, 0, Math.PI * 2)
    ctx.fill()

    // Finding marker ring
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)'
    ctx.lineWidth   = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.arc(fx, fy, fr * 3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Slice number overlay
  ctx.fillStyle = 'rgba(0, 212, 255, 0.7)'
  ctx.font      = '9px JetBrains Mono, monospace'
  ctx.fillText(`S:${String(sliceIdx + 1).padStart(3, '0')}`, 6, 14)

  // Window / level text
  ctx.fillStyle = 'rgba(100, 120, 150, 0.6)'
  ctx.font      = '8px JetBrains Mono, monospace'
  ctx.fillText('W:1500 L:-600', 6, H - 6)
}

function drawLungLobe(ctx, cx, cy, rx, ry, seed, sliceData, side) {
  // Dark lung parenchyma
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  grad.addColorStop(0,   'rgba(18, 18, 20, 0.95)')
  grad.addColorStop(0.7, 'rgba(12, 12, 15, 0.9)')
  grad.addColorStop(1,   'rgba(35, 35, 40, 0.4)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, (side === 'left' ? 0.15 : -0.15), 0, Math.PI * 2)
  ctx.fill()

  // Vessel markings (bright dots/lines)
  ctx.fillStyle = 'rgba(140, 140, 140, 0.5)'
  for (let i = 0; i < 8; i++) {
    const angle = (seed * 7 + i) * 2.4
    const dist  = rx * (0.2 + ((seed * 3 + i) % 1) * 0.55)
    const vx    = cx + Math.cos(angle) * dist
    const vy    = cy + Math.sin(angle) * dist * (ry / rx)
    ctx.beginPath()
    ctx.arc(vx, vy, 1 + ((seed * 5 + i) % 2), 0, Math.PI * 2)
    ctx.fill()
  }
}

export default function CTViewer({ analysis }) {
  const [activeSlice, setActiveSlice] = useState(10)
  const canvasRef = useRef(null)
  const slices = analysis?.slices || []

  useEffect(() => {
    if (!canvasRef.current || !analysis) return
    const canvas = canvasRef.current
    const slice  = slices[activeSlice] || { intensity: 0.5, has_finding: false }
    drawCTSlice(canvas, slice, analysis.scanId, activeSlice)
  }, [activeSlice, analysis])

  if (!analysis) return null

  return (
    <div className="panel p-4 space-y-3">
      <div className="label-tag">CT Viewer — Axial View</div>

      <div className="ct-viewer-container" style={{ aspectRatio: '1 / 1', maxHeight: '300px' }}>
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {/* Slice selector */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="label-tag">Slice</span>
          <span className="mono text-xs text-accent">{activeSlice + 1} / {slices.length}</span>
        </div>
        <input
          type="range"
          min={0}
          max={slices.length - 1}
          value={activeSlice}
          onChange={e => setActiveSlice(+e.target.value)}
          className="w-full"
          style={{ accentColor: 'var(--accent)' }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-dim">Window</span>
          <span className="mono text-black">1500</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Level</span>
          <span className="mono text-black">-600</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Plane</span>
          <span className="mono text-black">Axial</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Finding</span>
          <span className={`mono ${slices[activeSlice]?.has_finding ? 'text-pulse' : 'text-safe'}`}>
            {slices[activeSlice]?.has_finding ? 'DETECTED' : 'NONE'}
          </span>
        </div>
      </div>
    </div>
  )
}
