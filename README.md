# LungTwin — COVID-19 Lung Digital Twin

A full-stack web application for COVID-19 detection and progression simulation
using a Lung Digital Twin model. Upload CT scan slices and receive:

- **Variant classification** — Normal / Delta / Omicron
- **Severity score** — continuous [0, 1] regression
- **Confidence** — epistemic uncertainty estimate
- **3-D mesh statistics** — volume, surface area, HD95 approximation
- **CT slice reconstruction** — 64×64 latent-space digital twin output
- **Disease progression simulation** — 7 future time-steps via LSTM rollout

---

## Architecture

```
CT Scan (PNG slices)
       ↓
2.5D CNN Encoder (EfficientNet-B0, stacked slices)  ─── best_covid_twin.pt
       ↓
Geometric Feature Encoder (10-dim volumetric stats)
       ↓
Fusion + Temporal LSTM (2-layer attention-LSTM)
       ↓
┌─────────────────┬──────────────┬──────────────┐
│ Variant clf     │ Severity reg │ Confidence   │
│ (3-class)       │ [0,1]        │ sigmoid      │
└─────────────────┴──────────────┴──────────────┘
       ↓
Digital Twin Latent (256-d)
       ↓
Progression LSTM (3-layer + MHA)  ─── best_prog_lstm.pt
       ↓
Future CT state simulation (7 steps)
       ↓
CT Decoder (ConvTranspose2d)  ─── ct_decoder.pt
       ↓
64×64 reconstruction
```

---

## Project Structure

```
lung-digital-twin/
├── backend/
│   ├── main.py          # FastAPI application
│   ├── inference.py     # Full pipeline: preprocessing → inference → results
│   ├── models.py        # PyTorch model definitions
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx       # Header + nav
│   │   │   ├── CTUploader.jsx   # Drag-and-drop CT slice uploader
│   │   │   └── ResultsPanel.jsx # Variant card, mesh, reconstruction, progression
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Landing / overview
│   │   │   ├── Analyze.jsx      # Upload + inference UI
│   │   │   └── About.jsx        # Architecture + model info
│   │   ├── utils/api.js         # Axios API client
│   │   ├── styles/globals.css   # Tailwind + custom design tokens
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── models/
│   ├── best_covid_twin.pt   # Main digital twin (EfficientNet + LSTM + heads)
│   ├── best_prog_lstm.pt    # Progression LSTM (3-layer + MHA)
│   └── ct_decoder.pt        # CT reconstruction decoder
├── docker-compose.yml
├── start_backend.sh
└── start_frontend.sh
```

---

## Quick Start

### Option A — Manual (recommended for development)

**Backend**
```bash
chmod +x start_backend.sh
./start_backend.sh
# → http://localhost:8000
# → Swagger docs: http://localhost:8000/docs
```

**Frontend** (new terminal)
```bash
chmod +x start_frontend.sh
./start_frontend.sh
# → http://localhost:3000
```

### Option B — Docker Compose

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

---

## API Reference

| Method | Endpoint      | Description                           |
|--------|---------------|---------------------------------------|
| GET    | `/health`     | Health check                          |
| POST   | `/predict`    | Upload CT slices, get predictions     |
| GET    | `/model-info` | Architecture summary                  |
| GET    | `/docs`       | Interactive Swagger UI                |

### POST /predict

**Request**: `multipart/form-data` with one or more image files under the key `files`

**Response**:
```json
{
  "prediction": {
    "variant": "Delta",
    "variant_index": 1,
    "probabilities": { "Normal": 0.05, "Delta": 0.82, "Omicron": 0.13 },
    "severity_score": 0.67,
    "confidence": 0.88
  },
  "mesh": {
    "volume_voxels": 124800,
    "surface_voxels": 8640,
    "volume_fraction": 0.3125,
    "surface_to_volume": 0.0692,
    "hausdorff_approx_mm": 176.6,
    "slice_count": 16,
    "spatial_dims": [16, 512, 512]
  },
  "reconstruction": {
    "base64_png": "iVBOR...",
    "spatial_shape": [64, 64]
  },
  "progression": [
    { "step": 1, "severity": 0.68, "delta_norm": 0.1234 },
    ...
  ],
  "metrics": {
    "inference_time_s": 1.24,
    "slices_processed": 16,
    "device": "cpu"
  }
}
```

---

## CT Scan Input Format

- **Format**: PNG, JPEG, TIFF, or BMP
- **Content**: Single axial CT slice per file
- **Size**: Any resolution (resized to 224×224 internally)
- **Multiple slices**: Upload several slices; the 2.5D encoder uses the centre ± adjacent triple

---

## Models

| File | Architecture | Parameters |
|------|-------------|------------|
| `best_covid_twin.pt` | EfficientNet-B0 + 2-layer LSTM + 3 heads | ~5.5 M |
| `best_prog_lstm.pt`  | 3-layer LSTM + Multi-head Attention       | ~2.0 M |
| `ct_decoder.pt`      | FC + 4× ConvTranspose2d                   | ~0.3 M |

---

## Requirements

- Python 3.10+
- Node.js 18+
- 4 GB RAM minimum (models run on CPU if no GPU available)

---

## Disclaimer

This tool is for **research and educational purposes only**. It is not a certified
medical device and must not be used for clinical diagnosis. Always consult a
qualified radiologist or physician.
