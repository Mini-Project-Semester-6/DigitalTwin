import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { Layers, RotateCcw, Play, Pause } from 'lucide-react'

// ── Transfer function presets ─────────────────────────────────────────────
// Each preset defines colormap stops [value, r, g, b, alpha] in [0,1]
const PRESETS = {
  lung: {
    label: 'Lung',
    stops: [
      [0.00, 0.00, 0.00, 0.00, 0.00],
      [0.15, 0.05, 0.05, 0.08, 0.00],
      [0.25, 0.10, 0.35, 0.55, 0.04],
      [0.40, 0.20, 0.70, 0.65, 0.10],
      [0.55, 0.55, 0.85, 0.55, 0.18],
      [0.50, 0.55, 0.75, 0.92, 0.10],  // blue-white vessels
      [0.85, 0.90, 0.95, 1.00, 0.24],  // bright structures
      [1.00, 1.00, 1.00, 1.00, 0.35],
    ],
  },
  bone: {
    label: 'Bone',
    stops: [
      [0.00, 0.00, 0.00, 0.00, 0.00],
      [0.50, 0.00, 0.00, 0.00, 0.00],
      [0.65, 0.55, 0.38, 0.18, 0.08],
      [0.80, 0.88, 0.78, 0.58, 0.45],
      [1.00, 1.00, 0.98, 0.90, 0.80],
    ],
  },
  mip: {
    label: 'MIP',
    stops: [
      [0.00, 0.00, 0.20, 0.20, 0.00],
      [0.12, 0.00, 0.20, 0.20, 0.00],
      [0.15, 0.00, 0.65, 0.65, 0.35],
      [0.55, 0.00, 0.90, 0.85, 0.65],
      [1.00, 1.00, 1.00, 1.00, 1.00],
    ],
  },
  pet: {
    label: 'PET',
    stops: [
      [0.00, 0.00, 0.00, 0.00, 0.00],
      [0.10, 0.00, 0.00, 0.00, 0.00],
      [0.20, 0.50, 0.00, 0.00, 0.08],
      [0.50, 1.00, 0.50, 0.00, 0.30],
      [0.80, 1.00, 1.00, 0.00, 0.55],
      [1.00, 1.00, 1.00, 1.00, 0.85],
    ],
  },
}

// Interpolate a transfer function at value v → [r,g,b,a]
function sampleTF(stops, v) {
  for (let i = 1; i < stops.length; i++) {
    const [v0, r0, g0, b0, a0] = stops[i - 1]
    const [v1, r1, g1, b1, a1] = stops[i]
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0 + 1e-8)
      return [
        r0 + (r1 - r0) * t,
        g0 + (g1 - g0) * t,
        b0 + (b1 - b0) * t,
        a0 + (a1 - a0) * t,
      ]
    }
  }
  const last = stops[stops.length - 1]
  return [last[1], last[2], last[3], last[4]]
}

// Build RGBA transfer function texture (256 x 1)
function buildTFTexture(presetKey) {
  const stops = PRESETS[presetKey].stops
  const data = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = sampleTF(stops, i / 255)
    data[i * 4 + 0] = Math.round(r * 255)
    data[i * 4 + 1] = Math.round(g * 255)
    data[i * 4 + 2] = Math.round(b * 255)
    data[i * 4 + 3] = Math.round(a * 255)
  }
  const tex = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.needsUpdate = true
  return tex
}

// ── GLSL volume shader ────────────────────────────────────────────────────
const vertShader = /* glsl */`
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vOrigin    = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz + 0.5;
    vDirection = position - vOrigin + 0.5;
    gl_Position = projectionMatrix * mvPos;
  }
`

const fragShader = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uVolume;
  uniform sampler2D uTransferFunc;
  uniform float     uThreshold;
  uniform float     uOpacityScale;
  uniform float     uBrightness;
  uniform int       uSteps;

  varying vec3 vOrigin;
  varying vec3 vDirection;

  // Ray–AABB intersection (unit cube [0,1]³)
  vec2 hitBox(vec3 orig, vec3 dir) {
    vec3 tMin = (vec3(0.0) - orig) / dir;
    vec3 tMax = (vec3(1.0) - orig) / dir;
    vec3 t1   = min(tMin, tMax);
    vec3 t2   = max(tMin, tMax);
    float tN  = max(max(t1.x, t1.y), t1.z);
    float tF  = min(min(t2.x, t2.y), t2.z);
    return vec2(tN, tF);
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 bounds = hitBox(vOrigin, rayDir);

    if (bounds.x >= bounds.y) discard;
    bounds.x = max(bounds.x, 0.0);

    float stepSize = (bounds.y - bounds.x) / float(uSteps);
    vec3  pos      = vOrigin + bounds.x * rayDir;
    vec4  accum    = vec4(0.0);

    for (int i = 0; i < 512; i++) {
      if (i >= uSteps) break;

      float density = texture(uVolume, pos).r;

      if (density > uThreshold) {
        vec4 tfSample = texture2D(uTransferFunc, vec2(density, 0.5));
        tfSample.a   *= uOpacityScale * stepSize * 200.0;
        tfSample.rgb *= uBrightness;

        // Front-to-back alpha compositing
        accum.rgb += (1.0 - accum.a) * tfSample.a * tfSample.rgb;
        accum.a   += (1.0 - accum.a) * tfSample.a;
      }

      pos += rayDir * stepSize;
      if (pos.x < 0.0 || pos.x > 1.0 ||
          pos.y < 0.0 || pos.y > 1.0 ||
          pos.z < 0.0 || pos.z > 1.0) break;
      if (accum.a >= 0.98) break;
    }

    if (accum.a < 0.01) discard;
    gl_FragColor = accum;
  }
`

// ── MPR slice shader (axial / coronal / sagittal) ─────────────────────────
const sliceVertShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const sliceFragShader = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uVolume;
  uniform float     uSlice;
  uniform int       uAxis;       // 0=axial(Z) 1=coronal(Y) 2=sagittal(X)
  uniform float     uWL;
  uniform float     uWW;

  varying vec2 vUv;

  void main() {
    vec3 coords;
    if      (uAxis == 0) coords = vec3(vUv.x, vUv.y, uSlice);
    else if (uAxis == 1) coords = vec3(vUv.x, uSlice, vUv.y);
    else                 coords = vec3(uSlice, vUv.x, vUv.y);

    float density = texture(uVolume, coords).r;

    // Window / level
    float lo  = uWL - uWW * 0.5;
    float hi  = uWL + uWW * 0.5;
    float val = clamp((density - lo) / (hi - lo + 1e-6), 0.0, 1.0);

    gl_FragColor = vec4(vec3(val), 1.0);
  }
`

// ═══════════════════════════════════════════════════════════════════════════
export default function CTViewer3D({ volumeData }) {
  const mountRef = useRef(null)
  const threeCtx = useRef(null)
  const rafRef = useRef(null)

  const [preset, setPreset] = useState('lung')
  const [viewMode, setViewMode] = useState('3d')
  const [autoRotate, setAutoRotate] = useState(false)
  const [threshold, setThreshold] = useState(0.15)
  const [opacity, setOpacity] = useState(1.0)
  const [brightness, setBrightness] = useState(1.2)
  const [steps, setSteps] = useState(200)
  const [sliceZ, setSliceZ] = useState(0)
  const [sliceY, setSliceY] = useState(0)
  const [sliceX, setSliceX] = useState(0)
  const [wl, setWl] = useState(0.5)
  const [ww, setWw] = useState(0.8)
  const [ready, setReady] = useState(false)
  const [dims, setDims] = useState([64, 128, 128])

  // ── Decode base64 float32 → 3D texture ──────────────────────────────────
  const buildVolumeTexture = useCallback((vd) => {
    if (!vd?.voxels_b64) return null
    const bin = atob(vd.voxels_b64)
    const buf = new ArrayBuffer(bin.length)
    const u8 = new Uint8Array(buf)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    const f32 = new Float32Array(buf)

    const [D, H, W] = vd.dims
    // Convert float32 → Uint8 for DataTexture3D
    const u8vol = new Uint8Array(f32.length)
    for (let i = 0; i < f32.length; i++) {
      u8vol[i] = Math.round(Math.min(1, Math.max(0, f32[i])) * 255)
    }

    const tex = new THREE.Data3DTexture(u8vol, W, H, D)
    tex.format = THREE.RedFormat
    tex.type = THREE.UnsignedByteType
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.wrapR = THREE.ClampToEdgeWrapping
    tex.unpackAlignment = 1
    tex.needsUpdate = true
    return tex
  }, [])

  // ── Initialise Three.js scene ────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current || !volumeData?.voxels_b64) return

    // Cleanup previous
    if (threeCtx.current) {
      cancelAnimationFrame(rafRef.current)
      threeCtx.current.renderer.dispose()
      threeCtx.current = null
    }

    const W = mountRef.current.clientWidth || 620
    const H = mountRef.current.clientHeight || 380

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x0A1628, 1)
    mountRef.current.appendChild(renderer.domElement)

    // Scene + camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 100)
    camera.position.set(0, 0, 2.2)

    // Build volume texture
    const volTex = buildVolumeTexture(volumeData)
    if (!volTex) return
    const [D, H2, W2] = volumeData.dims
    setDims([D, H2, W2])

    // Transfer function texture
    const tfTex = buildTFTexture('lung')

    // Volume mesh — unit cube centred at origin
    const geometry = new THREE.BoxGeometry(1, 1, 1)

    const volMaterial = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uVolume: { value: volTex },
        uTransferFunc: { value: tfTex },
        uThreshold: { value: 0.15 },
        uOpacityScale: { value: 1.0 },
        uBrightness: { value: 1.2 },
        uSteps: { value: 200 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    })

    const volMesh = new THREE.Mesh(geometry, volMaterial)
    volMesh.rotation.set(-0.25, 0, 0)   // slight downward tilt → anterior (front) lung face
    scene.add(volMesh)

    // MPR slice planes
    const makePlane = (axis) => {
      const geo = new THREE.PlaneGeometry(1, 1)
      const mat = new THREE.ShaderMaterial({
        vertexShader: sliceVertShader,
        fragmentShader: sliceFragShader,
        uniforms: {
          uVolume: { value: volTex },
          uSlice: { value: 0 },
          uAxis: { value: axis },
          uWL: { value: 0.5 },
          uWW: { value: 0.8 },
        },
        // side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      return mesh
    }
    const axialPlane = makePlane(0)
    const coronalPlane = makePlane(1)
    axialPlane.rotation.x = -Math.PI / 2
    const sagittalPlane = makePlane(2)
    sagittalPlane.rotation.y = Math.PI / 2
    scene.add(axialPlane, coronalPlane, sagittalPlane)
    axialPlane.renderOrder = 1
    coronalPlane.renderOrder = 2
    sagittalPlane.renderOrder = 3

    // Mouse orbit
    let isDragging = false, lastX = 0, lastY = 0
    const onDown = (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY }
    const onUp = () => { isDragging = false }
    const onMove = (e) => {
      if (!isDragging) return
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      volMesh.rotation.y += dx * 0.008
      volMesh.rotation.x += dy * 0.008
      lastX = e.clientX; lastY = e.clientY
    }
    const onWheel = (e) => {
      e.preventDefault()
      camera.position.z = Math.max(0.5, Math.min(5, camera.position.z + e.deltaY * 0.001))
    }
    const el = renderer.domElement
    el.addEventListener('mousedown', onDown)
    el.addEventListener('touchstart', (e) => { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY }, { passive: true })
    el.addEventListener('touchend', () => isDragging = false)
    el.addEventListener('touchmove', (e) => { onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }) }, { passive: true })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    el.addEventListener('wheel', onWheel, { passive: false })

    // Render loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()
    setReady(true)

    threeCtx.current = {
      renderer, scene, camera,
      volMesh, volMaterial, volTex, tfTex,
      axialPlane, coronalPlane, sagittalPlane,
      cleanup: () => {
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('mousemove', onMove)
        el.removeEventListener('mousedown', onDown)
        el.removeEventListener('wheel', onWheel)
      }
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      threeCtx.current?.cleanup()
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
      volTex.dispose()
      tfTex.dispose()
      threeCtx.current = null
      setReady(false)
    }
  }, [volumeData])

  // ── Preset → rebuild transfer function texture ───────────────────────────
  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
    ctx.tfTex.dispose()
    const newTex = buildTFTexture(preset)
    ctx.tfTex = newTex
    ctx.volMaterial.uniforms.uTransferFunc.value = newTex
  }, [preset])

  // ── Uniform updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const u = threeCtx.current?.volMaterial?.uniforms
    if (u) u.uThreshold.value = threshold
  }, [threshold])

  useEffect(() => {
    const u = threeCtx.current?.volMaterial?.uniforms
    if (u) u.uOpacityScale.value = opacity
  }, [opacity])

  useEffect(() => {
    const u = threeCtx.current?.volMaterial?.uniforms
    if (u) u.uBrightness.value = brightness
  }, [brightness])

  useEffect(() => {
    const u = threeCtx.current?.volMaterial?.uniforms
    if (u) u.uSteps.value = steps
  }, [steps])

  // ── View mode ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
    const is3D = viewMode === '3d'
    ctx.volMesh.visible = is3D
    ctx.axialPlane.visible = viewMode === 'axial'
    ctx.coronalPlane.visible = viewMode === 'coronal'
    ctx.sagittalPlane.visible = viewMode === 'sagittal'
  }, [viewMode])

  // ── Slice position ───────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
    ctx.axialPlane.material.uniforms.uSlice.value = sliceZ
    ctx.axialPlane.position.y = sliceZ - 0.5
  }, [sliceZ])

  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
    ctx.coronalPlane.material.uniforms.uSlice.value = sliceY
    ctx.coronalPlane.position.z = sliceY - 0.5
  }, [sliceY])

  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
    ctx.sagittalPlane.material.uniforms.uSlice.value = sliceX
    ctx.sagittalPlane.position.x = sliceX - 0.5
  }, [sliceX])

  // ── Window/Level ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx) return
      ;[ctx.axialPlane, ctx.coronalPlane, ctx.sagittalPlane].forEach(p => {
        p.material.uniforms.uWL.value = wl
        p.material.uniforms.uWW.value = ww
      })
  }, [wl, ww])

  // ── Auto-rotate ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = threeCtx.current
    if (!ctx || !autoRotate) return
    const spin = () => { ctx.volMesh.rotation.y += 0.006 }
    const id = setInterval(spin, 16)
    return () => clearInterval(id)
  }, [autoRotate])

  const resetCamera = () => {
    const ctx = threeCtx.current
    if (!ctx) return
    ctx.volMesh.rotation.set(-0.25, 0, 0)
    ctx.camera.position.set(0, 0, 2.2)
    setSliceZ(0); setSliceY(0); setSliceX(0)
  }

  const VIEW_MODES = ['3d', 'axial', 'coronal', 'sagittal']

  if (!volumeData?.voxels_b64) return null

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ background: 'var(--panel)', borderBottom: '1px solid var(--rim)' }}>
        <div className="flex items-center gap-2">
          <Layers size={16} style={{ color: 'var(--cyan)' }} />
          <span className="font-display font-600 text-sm" style={{ color: 'var(--cyan)' }}>
            3D Volume Viewer
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: 'rgba(0,212,232,0.12)', color: 'var(--cyan)' }}>
            Three.js WebGL
          </span>
          {ready && (
            <span className="text-xs font-mono opacity-40">
              {dims[2]}×{dims[1]}×{dims[0]}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={resetCamera}
            className="p-1.5 rounded-lg"
            style={{ background: 'var(--card)', border: '1px solid var(--rim)' }}
            title="Reset">
            <RotateCcw size={13} style={{ color: 'var(--teal)' }} />
          </button>
          <button onClick={() => setAutoRotate(r => !r)}
            className="p-1.5 rounded-lg"
            style={{
              background: autoRotate ? 'rgba(0,212,232,0.15)' : 'var(--card)',
              border: `1px solid ${autoRotate ? 'var(--cyan)' : 'var(--rim)'}`,
            }}>
            {autoRotate
              ? <Pause size={13} style={{ color: 'var(--cyan)' }} />
              : <Play size={13} style={{ color: 'var(--cyan)' }} />
            }
          </button>
        </div>
      </div>

      {/* View mode + preset tabs */}
      <div className="flex flex-wrap items-center gap-1 px-4 pt-3">
        {VIEW_MODES.map(m => (
          <button key={m}
            onClick={() => setViewMode(m)}
            className="px-3 py-1 rounded-lg text-xs font-mono transition-all"
            style={{
              background: viewMode === m ? 'rgba(0,212,232,0.15)' : 'var(--panel)',
              border: `1px solid ${viewMode === m ? 'var(--cyan)' : 'var(--rim)'}`,
              color: viewMode === m ? 'var(--cyan)' : 'var(--slate)',
              textTransform: 'capitalize',
            }}>
            {m === '3d' ? '3D Volume' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex gap-1 flex-wrap">
          {Object.entries(PRESETS).map(([key, { label }]) => (
            <button key={key}
              onClick={() => setPreset(key)}
              className="px-3 py-1 rounded-lg text-xs font-mono transition-all"
              style={{
                background: preset === key ? 'rgba(155,138,255,0.15)' : 'var(--panel)',
                border: `1px solid ${preset === key ? 'var(--lavender)' : 'var(--rim)'}`,
                color: preset === key ? 'var(--lavender)' : 'var(--slate)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas mount */}
      <div className="relative mx-4 mt-3 rounded-xl overflow-hidden"
        style={{ height: 380, background: '#0A1628' }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(10,22,40,0.9)' }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-4 border-transparent animate-spin"
                style={{ borderTopColor: 'var(--cyan)' }} />
              <span className="text-xs font-mono" style={{ color: 'var(--cyan)' }}>
                Building 3D volume…
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 pb-4 pt-3 space-y-2">

        {/* Slice sliders */}
        {viewMode === 'axial' && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono opacity-50 w-20 shrink-0">Axial Z</span>
            <input type="range" min={0} max={1} step={0.005} value={sliceZ}
              onChange={e => setSliceZ(+e.target.value)} className="flex-1" />
            <span className="text-xs font-mono w-12 text-right"
              style={{ color: 'var(--cyan)' }}>
              {Math.round(sliceZ * dims[0])} / {dims[0]}
            </span>
          </div>
        )}
        {viewMode === 'coronal' && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono opacity-50 w-20 shrink-0">Coronal Y</span>
            <input type="range" min={0} max={1} step={0.005} value={sliceY}
              onChange={e => setSliceY(+e.target.value)} className="flex-1" />
            <span className="text-xs font-mono w-12 text-right"
              style={{ color: 'var(--lavender)' }}>
              {Math.round(sliceY * dims[1])} / {dims[1]}
            </span>
          </div>
        )}
        {viewMode === 'sagittal' && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono opacity-50 w-20 shrink-0">Sagittal X</span>
            <input type="range" min={0} max={1} step={0.005} value={sliceX}
              onChange={e => setSliceX(+e.target.value)} className="flex-1" />
            <span className="text-xs font-mono w-12 text-right"
              style={{ color: 'var(--amber)' }}>
              {Math.round(sliceX * dims[2])} / {dims[2]}
            </span>
          </div>
        )}

        {/* Window / Level for slice modes */}
        {viewMode !== '3d' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">W Level</span>
              <input type="range" min={0} max={1} step={0.01} value={wl}
                onChange={e => setWl(+e.target.value)} className="flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">W Width</span>
              <input type="range" min={0.05} max={1} step={0.01} value={ww}
                onChange={e => setWw(+e.target.value)} className="flex-1" />
            </div>
          </div>
        )}

        {/* Volume controls */}
        {viewMode === '3d' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">Threshold</span>
              <input type="range" min={0} max={0.8} step={0.005} value={threshold}
                onChange={e => setThreshold(+e.target.value)} className="flex-1" />
              <span className="text-xs font-mono w-8 text-right opacity-60">{threshold.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">Opacity</span>
              <input type="range" min={0.1} max={3} step={0.05} value={opacity}
                onChange={e => setOpacity(+e.target.value)} className="flex-1" />
              <span className="text-xs font-mono w-8 text-right opacity-60">{opacity.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">Brightness</span>
              <input type="range" min={0.5} max={3} step={0.05} value={brightness}
                onChange={e => setBrightness(+e.target.value)} className="flex-1" />
              <span className="text-xs font-mono w-8 text-right opacity-60">{brightness.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono opacity-50 w-16 shrink-0">Quality</span>
              <input type="range" min={50} max={400} step={10} value={steps}
                onChange={e => setSteps(+e.target.value)} className="flex-1" />
              <span className="text-xs font-mono w-8 text-right opacity-60">{steps}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}