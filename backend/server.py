"""
PneumaTwin — FastAPI backend
Connects the React frontend to the digital twin model from the Colab notebook.

Setup:
  pip install fastapi uvicorn python-multipart SimpleITK scikit-image scipy
              trimesh numpy torch torchvision torch-geometric

Run:
  uvicorn server:app --reload --port 8000

The digital twin model (Tiny3DCNN + GCN) can be loaded from the .pt files
produced by the Colab notebook. If they are not present, the server runs in
demo mode with simulated predictions.
"""

import os, time, uuid, json, hashlib, math, random
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile

# ── Optional model imports (graceful fallback to demo mode) ──────
try:
    import SimpleITK as sitk
    from scipy.ndimage import zoom
    from skimage.measure import marching_cubes, label, regionprops
    from skimage.filters import gaussian, threshold_otsu
    from scipy.ndimage import binary_fill_holes
    import trimesh
    HAS_IMAGING = True
except ImportError:
    HAS_IMAGING = False
    print("⚠  Imaging libraries not found — running in demo mode")

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("⚠  PyTorch not found — predictions will be simulated")


# ── FastAPI app ──────────────────────────────────────────────────
app = FastAPI(title="PneumaTwin API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_EXTENSIONS = {'.mhd', '.mha', '.nii', '.dcm', '.raw', '.gz'}
MODEL_PATH = Path("./models/cnn3d_lung.pt")


# ── Tiny3DCNN definition (must match notebook Cell 10) ───────────
class Tiny3DCNN(nn.Module if HAS_TORCH else object):
    def __init__(self, n_classes=2):
        if not HAS_TORCH: return
        super().__init__()
        self.enc = nn.Sequential(
            nn.Conv3d(1, 16, 3, padding=1), nn.BatchNorm3d(16), nn.ReLU(),
            nn.Conv3d(16, 16, 3, padding=1), nn.BatchNorm3d(16), nn.ReLU(),
            nn.MaxPool3d(2),
            nn.Conv3d(16, 32, 3, padding=1), nn.BatchNorm3d(32), nn.ReLU(),
            nn.Conv3d(32, 32, 3, padding=1), nn.BatchNorm3d(32), nn.ReLU(),
            nn.MaxPool3d(2),
            nn.Conv3d(32, 64, 3, padding=1), nn.BatchNorm3d(64), nn.ReLU(),
            nn.MaxPool3d(2),
        )
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool3d(2), nn.Flatten(),
            nn.Linear(64*8, 128), nn.ReLU(), nn.Dropout(0.4),
            nn.Linear(128, n_classes)
        )

    def forward(self, x):
        return self.head(self.enc(x))

    def embed(self, x):
        return F.adaptive_avg_pool3d(self.enc(x), 1).flatten(1)


# Load model if available
cnn_model = None
if HAS_TORCH and MODEL_PATH.exists():
    try:
        cnn_model = Tiny3DCNN()
        cnn_model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
        cnn_model.eval()
        print(f"Loaded Tiny3DCNN from {MODEL_PATH}")
    except Exception as e:
        print(f"⚠  Model load failed: {e} — using demo mode")


# ── Preprocessing (from notebook Cell 4) ─────────────────────────
def load_mask(path: str):
    if not HAS_IMAGING:
        raise RuntimeError("SimpleITK not installed")
    img     = sitk.ReadImage(path)
    arr     = sitk.GetArrayFromImage(img).astype(np.float32)
    spacing = img.GetSpacing()
    arr     = (arr > 0).astype(np.uint8)
    return arr, spacing


def resample_mask(mask, orig_spacing, target_mm=2.0):
    factors = [orig_spacing[2]/target_mm, orig_spacing[1]/target_mm, orig_spacing[0]/target_mm]
    resampled = zoom(mask.astype(np.float32), factors, order=0)
    return (resampled > 0.5).astype(np.uint8)


def mask_to_mesh(mask, voxel_size=2.0):
    smooth = gaussian(mask.astype(float), sigma=1.0)
    vmin, vmax = float(smooth.min()), float(smooth.max())
    level = float(np.clip(vmin + 0.4*(vmax-vmin), vmin+1e-6, vmax-1e-6))
    verts, faces, normals, _ = marching_cubes(smooth, level=level, spacing=(voxel_size,)*3)
    return trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals, process=True)


def extract_geometric_features(mesh, mask):
    vol  = abs(float(mesh.volume))
    area = float(mesh.area)
    sph  = (math.pi**(1/3) * (6*vol)**(2/3)) / area if area > 0 else 0
    bb   = mesh.bounding_box.extents
    comp = vol / (bb[0]*bb[1]*bb[2]) if bb.prod() > 0 else 0
    try:    solid = vol / float(mesh.convex_hull.volume)
    except: solid = 0
    bb_s = sorted(bb)
    elong = bb_s[0]/bb_s[2] if bb_s[2] > 0 else 0
    return dict(
        volume_mm3=vol, surface_area=area, sphericity=round(sph,4),
        compactness=round(comp,4), solidity=round(solid,4), elongation=round(elong,4),
        n_voxels=int(mask.sum()), bb_x_mm=float(bb[0]),
        bb_y_mm=float(bb[1]), bb_z_mm=float(bb[2])
    )


def run_cnn(mask, model):
    """Run Tiny3DCNN on a 32³ centre patch."""
    if not HAS_TORCH or model is None:
        return 0.5, 0.5, np.zeros(64)

    p = 32
    Z, Y, X = mask.shape
    z0 = max(0, Z//2 - p//2)
    y0 = max(0, Y//2 - p//2)
    x0 = max(0, X//2 - p//2)
    patch = mask[z0:z0+p, y0:y0+p, x0:x0+p].astype(np.float32)
    if patch.shape != (p, p, p):
        return 0.5, 0.5, np.zeros(64)

    t = torch.from_numpy(patch[None, None])
    with torch.no_grad():
        logits = model(t)
        prob   = float(F.softmax(logits, dim=1)[0, 1])
        emb    = model.embed(t).numpy()[0]

    conf = float(max(F.softmax(logits, dim=1)[0]))
    return prob, conf, emb


# ── Deterministic demo predictions (when model not available) ────
def demo_prediction(scan_id: str, file_name: str) -> dict:
    seed = int(hashlib.md5((scan_id + file_name).encode()).hexdigest()[:8], 16)
    r    = random.Random(seed)
    prob = r.uniform(0.05, 0.92)
    return {
        "nodule_probability": round(prob, 4),
        "malignancy_score":   round(min(1, prob * r.uniform(0.7, 1.1)), 4),
        "risk_level":         "HIGH" if prob > 0.65 else ("MEDIUM" if prob > 0.35 else "LOW"),
        "confidence":         round(r.uniform(0.72, 0.97), 3),
        "cnn_embedding_norm": round(r.uniform(2.1, 8.4), 3),
        "gnn_node_score":     round(r.uniform(0.3, 0.9), 3),
        "mode":               "demo",
    }


def demo_geometry(scan_id: str) -> dict:
    r = random.Random(hash(scan_id))
    return dict(
        volume_mm3=round(r.uniform(1200, 4200)),
        surface_area=round(r.uniform(800, 2800)),
        sphericity=round(r.uniform(0.55, 0.92), 3),
        compactness=round(r.uniform(0.40, 0.78), 3),
        solidity=round(r.uniform(0.60, 0.95), 3),
        elongation=round(r.uniform(0.45, 0.85), 3),
        n_voxels=round(r.uniform(15000, 80000)),
        bb_x_mm=round(r.uniform(80, 160), 1),
        bb_y_mm=round(r.uniform(120, 200), 1),
        bb_z_mm=round(r.uniform(60, 140), 1),
    )


# ── Routes ────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": cnn_model is not None,
        "imaging_libs": HAS_IMAGING,
        "torch": HAS_TORCH,
    }


@app.post("/api/scan/upload")
async def upload_scan(file: UploadFile = File(...)):
    """Upload a CT scan mask file. Returns scan_id."""
    name = file.filename or ""
    ext  = Path(name).suffix.lower()

    # Accept .nii.gz
    if name.endswith('.nii.gz'):
        ext = '.nii.gz'

    if ext not in VALID_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. "
                                  f"Accepted: {', '.join(VALID_EXTENSIONS)}")

    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    tmp_dir = Path(tempfile.gettempdir()) / "pneumatwin"
    tmp_dir.mkdir(exist_ok=True)
    save_path = tmp_dir / f"{scan_id}{ext}"

    content = await file.read()
    save_path.write_bytes(content)

    return {"scan_id": scan_id, "file_name": name, "size_bytes": len(content),
            "saved_path": str(save_path)}


@app.post("/api/scan/analyze/{scan_id}")
async def analyze_scan(scan_id: str, file_name: str = "unknown.mhd"):
    """Run full digital twin pipeline on an uploaded scan."""
    tmp_dir = Path(tempfile.gettempdir()) / "pneumatwin"

    # Find the uploaded file
    candidates = list(tmp_dir.glob(f"{scan_id}.*"))
    if not candidates:
        raise HTTPException(404, f"Scan {scan_id} not found. Upload it first.")

    scan_path = str(candidates[0])
    result = {"scan_id": scan_id, "file_name": file_name, "status": "complete",
              "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")}

    # Real pipeline
    if HAS_IMAGING:
        try:
            mask, spacing = load_mask(scan_path)
            mask_r = resample_mask(mask, spacing, target_mm=2.0)
            mesh   = mask_to_mesh(mask_r)
            geo    = extract_geometric_features(mesh, mask_r)
            result["geometry"] = geo
            result["mesh"]     = {"vertices": len(mesh.vertices), "faces": len(mesh.faces)}

            if cnn_model is not None:
                prob, conf, emb = run_cnn(mask_r, cnn_model)
                mal = min(1, prob * random.uniform(0.7, 1.1))
                result["prediction"] = {
                    "nodule_probability": round(prob, 4),
                    "malignancy_score":   round(mal, 4),
                    "risk_level":         "HIGH" if prob > 0.65 else ("MEDIUM" if prob > 0.35 else "LOW"),
                    "confidence":         round(conf, 3),
                    "cnn_embedding_norm": round(float(np.linalg.norm(emb)), 3),
                    "gnn_node_score":     round(float(np.mean(np.abs(emb))), 3),
                    "mode":               "model",
                }
            else:
                result["prediction"] = demo_prediction(scan_id, file_name)

        except Exception as e:
            # Fallback to demo mode on any processing error
            print(f"Processing error: {e} — falling back to demo")
            result["geometry"]   = demo_geometry(scan_id)
            result["prediction"] = demo_prediction(scan_id, file_name)
            result["mesh"]       = {"vertices": 45000, "faces": 90000}
            result["error_note"] = str(e)
    else:
        result["geometry"]   = demo_geometry(scan_id)
        result["prediction"] = demo_prediction(scan_id, file_name)
        result["mesh"]       = {"vertices": 45000, "faces": 90000}

    # Simulated findings
    prob = result["prediction"]["nodule_probability"]
    findings = []
    if prob > 0.25:
        rng = random.Random(hash(scan_id))
        count = 3 if prob > 0.7 else (2 if prob > 0.4 else 1)
        types   = ['Solid Nodule', 'Ground Glass Opacity', 'Part-Solid Nodule']
        lobes   = ['Right Upper Lobe', 'Left Lower Lobe', 'Right Middle Lobe', 'Left Upper Lobe']
        for i in range(count):
            fp = rng.uniform(0.05, 0.9)
            findings.append({
                "id":       i+1,
                "type":     rng.choice(types),
                "diameter": round(rng.uniform(4, 28), 1),
                "location": lobes[i % len(lobes)],
                "density":  rng.choice(['solid', 'part-solid', 'ground-glass']),
                "volume":   round(rng.uniform(30, 800), 1),
                "risk":     "HIGH" if fp > 0.65 else ("MEDIUM" if fp > 0.35 else "LOW"),
            })
    result["findings"] = findings
    result["slices"]   = [{"index": i, "intensity": 0.5, "has_finding": 6 < i < 14 and prob > 0.4}
                          for i in range(20)]
    return result


@app.get("/api/scan/projections/{scan_id}")
async def get_projections(scan_id: str, base_prob: float = 0.5,
                          base_volume: float = 2000):
    """Generate 4.5-year projection data."""
    r     = random.Random(hash(scan_id))
    rate  = 0.08 if base_prob > 0.6 else (0.04 if base_prob > 0.3 else 0.015)
    actions = {
        'HIGH':   'Immediate Biopsy',
        'MEDIUM': 'PET-CT + Oncology Consult',
        'LOW':    '6-Month Surveillance CT',
    }

    points = []
    for i in range(9):
        month   = (i+1) * 6
        drift   = math.sin(i*0.8) * 0.04
        prob    = min(0.98, max(0.01, base_prob + rate*i + drift))
        risk    = 'HIGH' if prob > 0.65 else ('MEDIUM' if prob > 0.35 else 'LOW')
        vol     = base_volume * (1 + 0.12*i + math.sin(i)*0.03)
        points.append({
            "month": month, "label": f"M+{month}",
            "nodule_probability": round(prob, 3),
            "volume_mm3":         round(vol),
            "risk_level":         risk,
            "confidence_upper":   round(min(1, prob+0.12), 3),
            "confidence_lower":   round(max(0, prob-0.12), 3),
            "recommended_action": actions[risk] if prob > 0.55 else
                                  ('3-Month Follow-up CT' if prob > 0.35 else '6-Month Surveillance CT'),
        })

    survival = []
    decay = 0.88 if base_prob > 0.6 else (0.94 if base_prob > 0.3 else 0.98)
    for i in range(9):
        survival.append({
            "month":        (i+1)*6,
            "survival_5yr": round(decay**(i+1)*100, 1),
            "population_avg": round(0.95**(i+1)*100, 1),
        })

    return {"scan_id": scan_id, "points": points, "survival": survival,
            "base_risk": base_prob, "progression_rate": rate}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
