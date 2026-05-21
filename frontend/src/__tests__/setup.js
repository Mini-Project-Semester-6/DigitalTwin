import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── ResizeObserver stub (not available in jsdom) ──────────────────────────
global.ResizeObserver = class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
}

// ── Canvas stub (CTViewer3D uses WebGL) ───────────────────────────────────
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  fillRect: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  font: '',
  fillText: vi.fn(),
}))

// ── Three.js mock (replaces the VTK.js mocks entirely) ────────────────────
vi.mock('three', () => {
  const mockRenderer = {
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: document.createElement('canvas'),
  }
  mockRenderer.domElement.addEventListener = vi.fn()
  mockRenderer.domElement.removeEventListener = vi.fn()
  const mockCamera = {
    position: { set: vi.fn(), z: 2.2 },
  }
  const mockMesh = {
    rotation: { set: vi.fn(), x: 0, y: 0, z: 0 },
    position: { set: vi.fn(), x: 0, y: 0, z: 0 },
    visible: true,
    material: {
      uniforms: {
        uVolume: { value: null },
        uTransferFunc: { value: null },
        uThreshold: { value: 0.15 },
        uOpacityScale: { value: 1.0 },
        uBrightness: { value: 1.2 },
        uSteps: { value: 200 },
        uSlice: { value: 0.5 },
        uAxis: { value: 0 },
        uWL: { value: 0.5 },
        uWW: { value: 0.8 },
      },
      dispose: vi.fn(),
    },
  }
  const mockTex = {
    needsUpdate: false,
    dispose:     vi.fn(),
    format:      1028,
    type:        1009,
    minFilter:   1006,
    magFilter:   1006,
    wrapS:       1001,
    wrapT:       1001,
    wrapR:       1001,
    unpackAlignment: 1,
  }
  const mockScene = {
    add: vi.fn(),
    remove: vi.fn(),
  }

  return {
    WebGLRenderer: vi.fn(() => mockRenderer),
    Scene: vi.fn(() => mockScene),
    PerspectiveCamera: vi.fn(() => mockCamera),
    BoxGeometry: vi.fn(() => ({
      dispose: vi.fn(),
    })),
    
    PlaneGeometry: vi.fn(() => ({
      dispose: vi.fn(),
    })),
    ShaderMaterial: vi.fn(() => ({ ...mockMesh.material })),
    Mesh: vi.fn(() => ({
      ...mockMesh,
      dispose: vi.fn(),
    })),
    Data3DTexture: vi.fn(() => ({ ...mockTex })),
    DataTexture: vi.fn(() => ({ ...mockTex })),
    LinearFilter: 1006,
    ClampToEdgeWrapping: 1001,
    RedFormat: 1028,
    RGBAFormat: 1023,
    UnsignedByteType: 1009,
    BackSide: 1,
    DoubleSide: 2,
  }
})