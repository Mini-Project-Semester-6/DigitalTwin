# PneumaTwin — Lung Digital Twin Web Application

A full-stack web application that accepts CT scan mask files, runs the
digital twin model (Tiny3DCNN + GCN from the LUNA16 Colab notebook), and
generates 4.5-year nodule progression projections.

---

## Project Structure

```
frontend/          ← React + Vite frontend
  src/
    pages/
      Dashboard.jsx     ← Home with stats + recent scans
      Upload.jsx        ← File upload with live processing log
      Analysis.jsx      ← Full analysis results + CT viewer
      Projections.jsx   ← 4.5-year charts + timeline table
      History.jsx       ← All scans archive
    components/
      Layout.jsx        ← Nav, ticker, status bar
      CTViewer.jsx      ← Canvas-rendered CT slice viewer
    lib/
      api.js            ← API service (demo mode + real backend)

backend/      ← FastAPI Python backend
  server.py             ← API routes + digital twin pipeline
  requirements.txt
```

---

## Quick Start (Frontend only — demo mode)

The frontend runs entirely standalone with simulated model outputs.
No Python backend required to explore the UI.

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

Upload any file named with a CT-like extension (.mhd, .mha, .nii, .dcm, .raw)
and the full demo pipeline runs in the browser.

---

## Full Stack Setup (with real model)

### Step 1 — Backend setup

```bash
cd backend
mkdir -p models
cp /path/to/cnn3d_lung.pt models/

pip install -r requirements.txt
# For torch-geometric you may need:
pip install torch-scatter torch-sparse torch-cluster \
  -f https://data.pyg.org/whl/torch-2.1.0+cpu.html

python server.py
# API running at http://localhost:8000
# Docs at       http://localhost:8000/docs
```

### Step 2 — Frontend with real backend

The frontend proxies `/api/*` to `http://localhost:8000` via vite.config.js.

```bash
cd frontend
npm install
npm run dev
```

Now uploads go through the real digital twin pipeline:
1. `POST /api/scan/upload`       — saves the file
2. `POST /api/scan/analyze/{id}` — runs resample → mesh → CNN → features
3. `GET  /api/scan/projections/{id}` — generates temporal forecasts

---

## Accepted File Types

| Format | Extension | Notes |
|--------|-----------|-------|
| MetaImage | `.mhd` + `.raw` | LUNA16 default. Upload the .mhd; .raw must be in the same directory |
| MetaImage | `.mha` | Single-file variant |
| NIfTI | `.nii`, `.nii.gz` | Common neuroimaging format |
| DICOM | `.dcm` | Clinical CT format |
| Raw binary | `.raw` | With known dimensions |

---

## Connecting the Colab Model to the Backend

The `server.py` loads `Tiny3DCNN` using the same architecture as notebook
Cell 10. If the weights file is missing, the server automatically falls back
to demo mode (deterministic pseudo-random predictions seeded from the scan ID).

To verify the model loaded correctly:
```bash
curl http://localhost:8000/api/health
# {"status":"ok","model_loaded":true,"imaging_libs":true,"torch":true}
```

---

## What the Digital Twin Produces

### Geometric Features (16 total)
- `volume_mm3` — total lung volume in cubic millimetres
- `surface_area` — mesh surface area (mm²)
- `sphericity` — how close the shape is to a perfect sphere (0–1)
- `compactness` — volume / bounding box volume ratio
- `solidity` — volume / convex hull volume (concavity measure)
- `elongation` — shortest / longest bounding box axis ratio
- `mean_curv`, `std_curv` — mean and std of surface curvature
- `n_voxels` — total lung voxel count
- `extent` — voxel fill ratio within bounding box
- `bb_x_mm`, `bb_y_mm`, `bb_z_mm` — bounding box dimensions

### Model Scores
- `nodule_probability` — CNN+GNN fused probability (0–1)
- `malignancy_score` — estimated malignancy likelihood
- `risk_level` — HIGH / MEDIUM / LOW
- `confidence` — model confidence in its classification
- `cnn_embedding_norm` — L2 norm of 64-d CNN bottleneck embedding
- `gnn_node_score` — GCN node-level classification score

### Projections (9 × 6-month intervals)
- Nodule probability trajectory with 95% confidence band
- Volume growth curve
- Kaplan-Meier-style 5-year survival estimate vs population average
- Recommended clinical action per timepoint

---

## Disclaimer

**Research use only.** Not validated for clinical diagnosis or treatment
planning. All model outputs must be reviewed by a qualified radiologist.
The Tiny3DCNN + GCN model is trained on the LUNA16 pre-segmented dataset
and has not been evaluated on independent clinical cohorts.
