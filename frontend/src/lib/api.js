// Simulates the digital twin model backend responses
// In production, replace these with axios calls to your FastAPI server

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Simulate model inference with realistic LUNA16-style outputs
function generateScanAnalysis(scanId, fileName) {
  const seed = fileName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rng  = (min, max) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min)

  const noduleProbability = Math.min(0.95, Math.max(0.05, rng(0.1, 0.9)))
  const malignancyScore   = noduleProbability * rng(0.6, 1.1)
  const riskLevel = malignancyScore > 0.65 ? 'HIGH' : malignancyScore > 0.35 ? 'MEDIUM' : 'LOW'

  return {
    scanId,
    fileName,
    timestamp: new Date().toISOString(),
    status: 'complete',

    // Geometric features from digital twin
    geometry: {
      volume_mm3:   Math.round(rng(1200, 4200)),
      surface_area: Math.round(rng(800, 2800)),
      sphericity:   parseFloat(rng(0.55, 0.92).toFixed(3)),
      compactness:  parseFloat(rng(0.40, 0.78).toFixed(3)),
      solidity:     parseFloat(rng(0.60, 0.95).toFixed(3)),
      elongation:   parseFloat(rng(0.45, 0.85).toFixed(3)),
      mean_curv:    parseFloat(rng(0.001, 0.012).toFixed(4)),
      n_voxels:     Math.round(rng(15000, 80000)),
      bb_x_mm:      Math.round(rng(80, 160)),
      bb_y_mm:      Math.round(rng(120, 200)),
      bb_z_mm:      Math.round(rng(60, 140)),
    },

    // Model predictions
    prediction: {
      nodule_probability:   parseFloat(noduleProbability.toFixed(4)),
      malignancy_score:     parseFloat(Math.min(1, malignancyScore).toFixed(4)),
      risk_level:           riskLevel,
      confidence:           parseFloat(rng(0.72, 0.97).toFixed(3)),
      cnn_embedding_norm:   parseFloat(rng(2.1, 8.4).toFixed(3)),
      gnn_node_score:       parseFloat(rng(0.3, 0.9).toFixed(3)),
    },

    // Detected findings
    findings: generateFindings(noduleProbability, seed),

    // Mesh stats
    mesh: {
      vertices: Math.round(rng(12000, 85000)),
      faces:    Math.round(rng(24000, 170000)),
    },

    // Slice data for viewer (simulated as gradients)
    slices: Array.from({ length: 20 }, (_, i) => ({
      index: i,
      intensity: rng(0.3, 0.8),
      has_finding: i > 6 && i < 14 && noduleProbability > 0.4,
    })),
  }
}

function generateFindings(prob, seed) {
  if (prob < 0.25) return []
  const rng = (min, max) => min + ((seed * 1234 + 5678) % 9999) / 9999 * (max - min)
  const count = prob > 0.7 ? 3 : prob > 0.4 ? 2 : 1
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    type:     prob > 0.6 ? 'Solid Nodule' : 'Ground Glass Opacity',
    diameter: parseFloat((rng(4, 28) + i * 3).toFixed(1)),
    location: ['Right Upper Lobe', 'Left Lower Lobe', 'Right Middle Lobe', 'Left Upper Lobe'][i % 4],
    density:  ['solid', 'part-solid', 'ground-glass'][Math.floor(rng(0, 2.9))],
    volume:   parseFloat(rng(30, 800).toFixed(1)),
    risk:     prob > 0.65 ? 'HIGH' : prob > 0.35 ? 'MEDIUM' : 'LOW',
  }))
}

// Generate temporal projection data (6-month intervals, 4 years)
export function generateProjections(scanId, baseAnalysis) {
  const base = baseAnalysis.prediction.nodule_probability
  const progression_rate = base > 0.6 ? 0.08 : base > 0.3 ? 0.04 : 0.015

  const intervals = 9  // 4.5 years at 6-month intervals
  const points = Array.from({ length: intervals }, (_, i) => {
    const month   = (i + 1) * 6
    const drift   = (Math.sin(i * 0.8) * 0.04)  // biological variation
    const trend   = base + progression_rate * i + drift
    const prob    = Math.min(0.98, Math.max(0.01, trend))
    const vol_growth = baseAnalysis.geometry.volume_mm3 * (1 + 0.12 * i + Math.sin(i) * 0.03)

    return {
      month,
      label:              `M+${month}`,
      nodule_probability: parseFloat(prob.toFixed(3)),
      volume_mm3:         Math.round(vol_growth),
      risk_level:         prob > 0.65 ? 'HIGH' : prob > 0.35 ? 'MEDIUM' : 'LOW',
      confidence_upper:   parseFloat(Math.min(1, prob + 0.12).toFixed(3)),
      confidence_lower:   parseFloat(Math.max(0, prob - 0.12).toFixed(3)),
      recommended_action: prob > 0.75 ? 'Immediate Biopsy' :
                          prob > 0.55 ? 'PET-CT + Oncology Consult' :
                          prob > 0.35 ? '3-Month Follow-up CT' :
                          '6-Month Surveillance CT',
    }
  })

  // Survival probability curve (Kaplan-Meier style)
  const survival = Array.from({ length: intervals }, (_, i) => {
    const decay = base > 0.6 ? 0.88 : base > 0.3 ? 0.94 : 0.98
    return {
      month: (i + 1) * 6,
      survival_5yr: parseFloat((Math.pow(decay, i + 1) * 100).toFixed(1)),
      population_avg: parseFloat((Math.pow(0.95, i + 1) * 100).toFixed(1)),
    }
  })

  return { scanId, points, survival, baseRisk: base, progressionRate: progression_rate }
}

// API surface
export const api = {
  async uploadScan(file, onProgress) {
    // Validate file type
    const validTypes = ['.mhd', '.mha', '.nii', '.nii.gz', '.dcm', '.raw']
    const name = file.name.toLowerCase()
    const isValid = validTypes.some(ext => name.endsWith(ext)) ||
                    file.type === 'application/dicom' ||
                    name.includes('ct') || name.includes('scan') || name.includes('lung')

    if (!isValid && !name.match(/\.(mhd|mha|nii|dcm|raw)$/i)) {
      throw new Error('Invalid file type. Please upload a CT scan file (.mhd, .mha, .nii, .dcm, .raw)')
    }

    // Simulate upload progress
    for (let p = 0; p <= 100; p += 10) {
      await sleep(120)
      onProgress?.(p)
    }

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    return { scanId, fileName: file.name }
  },

  async analyzeScan(scanId, fileName, onStage) {
    const stages = [
      { label: 'Loading mask volume...', duration: 600 },
      { label: 'Resampling to 2mm isotropic...', duration: 500 },
      { label: 'Running Marching Cubes mesh reconstruction...', duration: 800 },
      { label: 'Extracting geometric features...', duration: 400 },
      { label: 'Running 3D CNN patch inference (FP16)...', duration: 900 },
      { label: 'Building k-NN graph for GNN...', duration: 500 },
      { label: 'GCN forward pass...', duration: 600 },
      { label: 'Fusing digital twin features...', duration: 400 },
      { label: 'Generating predictions...', duration: 300 },
    ]

    for (const stage of stages) {
      onStage?.(stage.label)
      await sleep(stage.duration)
    }

    return generateScanAnalysis(scanId, fileName)
  },

  async getProjections(scanId, analysis) {
    await sleep(800)
    return generateProjections(scanId, analysis)
  },

  // Persistent store (localStorage)
  saveAnalysis(analysis) {
    const all = this.getAllAnalyses()
    all[analysis.scanId] = analysis
    localStorage.setItem('pneumatwin_analyses', JSON.stringify(all))
  },

  getAnalysis(scanId) {
    return this.getAllAnalyses()[scanId] || null
  },

  getAllAnalyses() {
    try {
      return JSON.parse(localStorage.getItem('pneumatwin_analyses') || '{}')
    } catch {
      return {}
    }
  },

  deleteAnalysis(scanId) {
    const all = this.getAllAnalyses()
    delete all[scanId]
    localStorage.setItem('pneumatwin_analyses', JSON.stringify(all))
  },
}

export default api
