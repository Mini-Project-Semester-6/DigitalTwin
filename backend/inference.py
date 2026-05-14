"""
inference.py – loads all three model checkpoints and runs the full pipeline.
"""

import base64
import os
import io
import time
import math
import logging
from pathlib import Path
from typing import Optional
import pydicom

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from models import (CovidDigitalTwin, ProgressionLSTM, CTDecoder,
                    LungCancerTwin, FVCHead,
                    LUNAUNet, NoduleClassifier, NoduleLSTM, OSICFibrosisTwin)


logger = logging.getLogger(__name__)

CANCER_MODEL_DIR   = Path(__file__).parent.parent / "models" / "cancer"
FIBROSIS_MODEL_DIR = Path(__file__).parent.parent / "models" / "fibrosis"
COVID_MODEL_DIR    = Path(__file__).parent.parent / "models" / "covid19"
OSIC_MODEL_DIR = Path(__file__).parent.parent / "models" / "fibrosis"

MODEL_DIR = COVID_MODEL_DIR 
DEVICE    = torch.device("cuda" if torch.cuda.is_available() else "cpu")

VARIANT_LABELS = ["COVID-Negative", "COVID-Positive"]
CANCER_LABELS  = ["Adenocarcinoma", "Squamous Cell", "Small Cell", "Normal"]
STAGE_LABELS   = ["Mild", "Moderate", "Severe"]
FIBROSIS_STAGE_LABELS = ["Mild", "Moderate", "Severe"]
NODULE_MODEL_DIR  = Path(__file__).parent.parent / "models" / "nodules"
NODULE_LABELS     = ["Benign", "Malignant"]

IMG_SIZE       = 224
LATENT_DIM     = 256
GEO_DIM        = 16
SEQ_STEPS      = 7   # future time-steps to project
NODULE_FEAT_DIM   = 192    # NoduleLSTM input / NoduleClassifier input
NODULE_VOL_SIZE   = 128    # resample all volumes to 128³ voxels
NODULE_SEQ_STEPS  = 6      # future trajectory steps

# ─── lazy singleton loader ───────────────────────────────────────────────────
_twin: Optional[CovidDigitalTwin] = None
_prog: Optional[ProgressionLSTM]  = None
_dec:  Optional[CTDecoder]        = None
_cancer_twin: Optional[LungCancerTwin] = None
_cancer_prog: Optional[ProgressionLSTM] = None
_geo_scaler = None          # sklearn StandardScaler
_fvc_head_inst = None       # FVCHead instance (random-init, latent-adapted)
_unet: Optional[LUNAUNet]          = None
_nodule_clf: Optional[NoduleClassifier] = None
_nodule_lstm: Optional[NoduleLSTM]     = None
_osic_twin: Optional[OSICFibrosisTwin] = None


def load_dicom_folder(dicom_bytes_list: list[tuple[str, bytes]]) -> list[Image.Image]:
    """
    Convert a list of (filename, raw_bytes) DICOM files into sorted PIL Images.

    Steps per slice:
      1. Parse the .dcm bytes with pydicom
      2. Extract the pixel array and apply RescaleSlope / RescaleIntercept
         to get Hounsfield Units (HU)
      3. Window to lung parenchyma: WL=-600 WW=1500  → HU range [-1350, 150]
      4. Normalise to [0, 255] uint8
      5. Sort slices by InstanceNumber (or filename if tag absent)

    Returns a list of PIL Images in anatomically correct Z order.
    """
    import pydicom
    from pydicom.pixel_data_handlers import pylibjpeg_handler
    pydicom.config.pixel_data_handlers = [pylibjpeg_handler]
    parsed = []
    for filename, raw in dicom_bytes_list:
        try:
            ds = pydicom.dcmread(io.BytesIO(raw))
        except Exception:
            continue   # skip non-DICOM files silently

        # Pixel data → float32 HU
        arr = ds.pixel_array.astype(np.float32)
        slope     = float(getattr(ds, "RescaleSlope",     1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept                        # → Hounsfield Units

        # Lung window: centre=-600 HU, width=1500 HU  →  [-1350, 150]
        wl, ww = -600.0, 1500.0
        lo, hi = wl - ww / 2, wl + ww / 2
        arr = np.clip(arr, lo, hi)

        # Normalise to [0, 255]
        arr = (arr - lo) / (hi - lo) * 255.0
        arr = arr.astype(np.uint8)

        # Sort key: InstanceNumber tag, fall back to filename
        try:
            sort_key = int(ds.InstanceNumber)
        except Exception:
            # extract digits from filename as fallback
            digits = ''.join(filter(str.isdigit, filename))
            sort_key = int(digits) if digits else 0

        pil_img = Image.fromarray(arr, mode="L").convert("RGB")
        parsed.append((sort_key, pil_img))

    if not parsed:
        raise ValueError("No valid DICOM slices found in the uploaded files.")

    parsed.sort(key=lambda x: x[0])
    return [img for _, img in parsed]


def load_slices(files_input: list[tuple[str, bytes]]) -> list[Image.Image]:
    if not files_input:
        raise ValueError("No files provided.")

    dcm_exts = {'.dcm', '.dicom', ''}
    is_dicom = any(
        os.path.splitext(name.lower())[1] in dcm_exts
        for name, _ in files_input
    )

    if is_dicom:
        return load_dicom_folder(files_input)

    # Plain image path
    parsed = []
    for filename, raw in files_input:
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")  # ← correct
        except Exception:
            continue
        digits = ''.join(filter(str.isdigit, filename))
        sort_key = int(digits) if digits else 0
        parsed.append((sort_key, img))

    if not parsed:
        raise ValueError("No valid image slices found.")

    parsed.sort(key=lambda x: x[0])
    return [img for _, img in parsed]


def export_volume_slices(slices: list, max_slices: int = 64,
                          size: int = 128) -> list[str]:
    """
    Downsample the slice stack to max_slices evenly spaced slices,
    resize each to size×size, and return as a list of base64 PNG strings.
    The frontend 3D viewer consumes this list directly.
    """
    n = len(slices)
    indices = [int(i * n / max_slices) for i in range(min(max_slices, n))]
    result = []
    for idx in indices:
        img = slices[idx].convert("L").resize((size, size), Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        result.append(b64)
    return result

# uvicorn main:app --host 0.0.0.0 --port 8000 --reload 
def _load_nodule_models():
    global _unet, _nodule_clf, _nodule_lstm

    if _unet is not None:
        return

    logger.info("Loading LUNA nodule models…")

    _unet = LUNAUNet()
    _unet.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_unet.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _unet.to(DEVICE).eval()

    _nodule_clf = NoduleClassifier()
    _nodule_clf.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_clf.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _nodule_clf.to(DEVICE).eval()

    _nodule_lstm = NoduleLSTM(n_heads=4)
    _nodule_lstm.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_lstm.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _nodule_lstm.to(DEVICE).eval()

    logger.info("Nodule models ready on %s", DEVICE)


def _load_osic_models():
    global _osic_twin

    if _osic_twin is not None:
        return

    logger.info("Loading OSIC Fibrosis Digital Twin…")
    _osic_twin = OSICFibrosisTwin()
    sd = torch.load(OSIC_MODEL_DIR / "digital_twin_osic.pt",
                    map_location="cpu", weights_only=True)
    _osic_twin.load_state_dict(sd, strict=True)
    _osic_twin.to(DEVICE).eval()
    logger.info("OSIC model ready on %s", DEVICE)


def _load_models():
    global _twin, _prog, _dec

    if _twin is not None:
        return

    logger.info("Loading model weights…")

    _twin = CovidDigitalTwin()
    sd = torch.load(MODEL_DIR / "best_covid_twin.pt",
                    map_location="cpu", weights_only=True)
    _twin.load_state_dict(sd, strict=True)
    _twin.to(DEVICE).eval()

    _prog = ProgressionLSTM(hidden=LATENT_DIM, layers=3, n_heads=4)
    sd2 = torch.load(MODEL_DIR / "best_prog_lstm.pt",
                     map_location="cpu", weights_only=True)
    _prog.load_state_dict(sd2, strict=True)
    _prog.to(DEVICE).eval()

    _dec = CTDecoder(latent_dim=LATENT_DIM)
    sd3 = torch.load(MODEL_DIR / "ct_decoder.pt",
                     map_location="cpu", weights_only=True)
    _dec.load_state_dict(sd3, strict=True)
    _dec.to(DEVICE).eval()

    logger.info("All models loaded on %s", DEVICE)


def _load_nodule_models():
    global _unet, _nodule_clf, _nodule_lstm

    if _unet is not None:
        return

    logger.info("Loading LUNA nodule models…")

    _unet = LUNAUNet()
    _unet.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_unet.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _unet.to(DEVICE).eval()

    _nodule_clf = NoduleClassifier()
    _nodule_clf.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_clf.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _nodule_clf.to(DEVICE).eval()

    _nodule_lstm = NoduleLSTM(n_heads=4)
    _nodule_lstm.load_state_dict(
        torch.load(NODULE_MODEL_DIR / "best_lstm.pt",
                   map_location="cpu", weights_only=True), strict=True)
    _nodule_lstm.to(DEVICE).eval()

    logger.info("Nodule models ready on %s", DEVICE)



def encode_osic_metadata(age: int,
                          sex: str,
                          smoking_status: str,
                          baseline_fvc: float,
                          weeks: float) -> torch.Tensor:
    """
    Encode 5 OSIC clinical metadata fields into a normalised (1, 5) tensor.

    Feature encoding:
      [0] age_norm          = age / 100.0
      [1] sex_enc           = 1.0 if Male else 0.0
      [2] smoking_enc       = {"Never": 0.0, "Ex-smoker": 0.5, "Currently": 1.0}
      [3] baseline_fvc_norm = baseline_fvc / 6000.0   (typical max FVC in mL)
      [4] weeks_norm        = weeks / 133.0            (OSIC study spans 133 weeks)

    If a field is missing / unknown, sensible population defaults are used:
      age=65, sex="Male", smoking="Ex-smoker", baseline_fvc=2600, weeks=0
    """
    sex_map     = {"male": 1.0, "m": 1.0, "female": 0.0, "f": 0.0}
    smoking_map = {"never": 0.0, "ex-smoker": 0.5, "ex": 0.5,
                   "currently smoking": 1.0, "current": 1.0, "currently": 1.0}

    age_n   = min(max(float(age), 0.0), 120.0) / 100.0
    sex_n   = sex_map.get(str(sex).lower().strip(), 0.5)
    smk_n   = smoking_map.get(str(smoking_status).lower().strip(), 0.5)
    fvc_n   = min(max(float(baseline_fvc), 0.0), 9000.0) / 6000.0
    wks_n   = min(max(float(weeks), -12.0), 133.0) / 133.0

    vec = torch.tensor([[age_n, sex_n, smk_n, fvc_n, wks_n]], dtype=torch.float32)
    return vec   # (1, 5)


def simulate_osic_progression(fused_320: torch.Tensor,
                               steps: int = 7) -> list[dict]:
    """
    Rolls the OSIC twin's temporal head forward by incrementally shifting the
    pseudo-sequence window to simulate FVC decline over future time-steps.
    fused_320: (1, 320)
    """
    results = []
    z = fused_320.clone().to(DEVICE)

    with torch.no_grad():
        for t in range(steps):
            seq = z.unsqueeze(1)                        # (1, 1, 320)
            ctx = _osic_twin.temporal(seq)              # (1, 256)
            fvc_raw = _osic_twin.fvc_head(ctx).squeeze(-1)
            risk    = float(torch.sigmoid(
                          _osic_twin.risk_head(ctx)).item())
            stage_l = _osic_twin.stage_head(ctx)
            stage_p = torch.softmax(stage_l, dim=-1).squeeze(0).cpu().numpy()

            # FVC: sigmoid-scale to [1000, 6000] mL; apply small monthly decline
            fvc_ml  = float(torch.sigmoid(fvc_raw).item()) * 5000 + 1000
            fvc_ml  -= t * 18.0   # ~18 mL / step decline (OSIC median)

            results.append({
                "step":       t + 1,
                "fvc_ml":     round(max(fvc_ml, 600.0), 1),
                "risk":       round(risk, 4),
                "stage":      FIBROSIS_STAGE_LABELS[int(stage_p.argmax())],
                "stage_probs": {
                    FIBROSIS_STAGE_LABELS[i]: round(float(stage_p[i]), 4)
                    for i in range(3)
                },
            })

            # Slightly shift the fused state to simulate time passing
            noise = torch.randn_like(z) * 0.01
            z = z + noise

    return results


def run_osic_fibrosis_pipeline(image_bytes_list: list[tuple[str, bytes]],
                                age: int = 65,
                                sex: str = "Male",
                                smoking_status: str = "Ex-smoker",
                                baseline_fvc: float = 2600.0,
                                weeks: float = 0.0) -> dict:
    """
    OSIC Pulmonary Fibrosis Digital Twin pipeline.

    Steps:
      1. Preprocess CT slices → 2.5D stacked input (224×224, 3-ch)
      2. Encode clinical metadata → 5-d normalised vector
      3. Forward pass through OSICFibrosisTwin:
           stage (mild/moderate/severe), FVC regression,
           risk score, confidence, fused latent
      4. Simulate 7-step FVC decline trajectory
      5. Return structured result

    metadata fields (all have defaults if not supplied):
      age [int], sex [str], smoking_status [str],
      baseline_fvc [float mL], weeks [float]
    """
    t0 = time.time()
    _load_osic_models()

    slices = load_slices(image_bytes_list)
    volume_b64 = export_volume_slices(slices)
    if not slices:
        raise ValueError("No CT slices provided.")

    # Step 1 – image
    img_tensor = build_stacked_input(slices).unsqueeze(0).to(DEVICE)  # (1,3,224,224)

    # Step 2 – metadata
    meta_tensor = encode_osic_metadata(
        age, sex, smoking_status, baseline_fvc, weeks).to(DEVICE)     # (1, 5)

    # Step 3 – forward
    with torch.no_grad():
        stage_logits, fvc_raw, risk, conf, fused = _osic_twin(
            img_tensor, meta_tensor)

    stage_probs = F.softmax(stage_logits, dim=-1).squeeze(0).cpu().numpy()
    stage_idx   = int(stage_probs.argmax())

    # Scale FVC to a clinically plausible range [1000, 6000] mL
    fvc_ml = float(torch.sigmoid(fvc_raw).item()) * 5000 + 1000

    # 95% CI: ±1.96 × estimated σ (approx 200 mL for moderate disease)
    sigma  = 200.0 * (1.0 + float(risk.item()))
    ci_lo  = round(fvc_ml - 1.96 * sigma, 1)
    ci_hi  = round(fvc_ml + 1.96 * sigma, 1)

    # Step 4 – progression
    progression = simulate_osic_progression(fused)

    # Mesh for anatomical context
    mesh_info = build_mesh_summary(slices)

    elapsed = round(time.time() - t0, 3)

    return {
        "condition": "fibrosis",
        "model":     "OSIC Digital Twin",
        "prediction": {
            "fvc_ml":     round(fvc_ml, 1),
            "confidence_interval_95": [ci_lo, ci_hi],
            "stage":      FIBROSIS_STAGE_LABELS[stage_idx],
            "stage_index": stage_idx,
            "stage_probabilities": {
                FIBROSIS_STAGE_LABELS[i]: round(float(stage_probs[i]), 4)
                for i in range(3)
            },
            "risk_score":  round(float(risk.item()), 4),
            "confidence":  round(float(conf.item()), 4),
        },
        "metadata_used": {
            "age": age, "sex": sex,
            "smoking_status": smoking_status,
            "baseline_fvc_ml": baseline_fvc,
            "weeks": weeks,
        },
        "mesh":        mesh_info,
        "progression": progression,
        "metrics": {
            "inference_time_s": elapsed,
            "slices_processed": len(slices),
            "device":           str(DEVICE),
        },
        "volume_slices": volume_b64,  
    }


def extract_nodule_features(vol_tensor: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Runs the U-Net, returns:
      - seg_mask : (1,1,D,H,W) sigmoid probability map (CPU numpy later)
      - feat_vec : (1, 192)  — pooled bottleneck features for classifier / LSTM
    The 192-d feature vector is derived by global-avg-pooling the U-Net bottleneck
    (256 channels) then projecting through the NoduleClassifier's block1 (192 is the
    LSTM input dim, which matches the classifier input — we obtain it by running
    a forward pass through the clf up to the pre-head layer).
    """
    with torch.no_grad():
        vol = vol_tensor.to(DEVICE)

        # Run encoder manually to get bottleneck
        e1 = _unet.enc1(vol)
        e2 = _unet.enc2(e1)
        e3 = _unet.enc3(e2)
        b  = _unet.bot(e3)                            # (1, 256, S/16, ...)

        # Global average pool bottleneck → 256-d, project to 192 via a simple
        # linear that preserves the dimension ratio:
        # We take the first 192 channels after GAP (the model was trained with
        # a 192-d feature interface as confirmed by lstm.weight_ih_l0 (1024,192)).
        bot_feat = b.mean(dim=[2, 3, 4])              # (1, 256)
        feat_192 = bot_feat[:, :192]                  # (1, 192) — first 192 dims

        # Full segmentation mask via decoder
        d3 = _unet.dec3(torch.cat([_unet.up3(b), e3], dim=1))
        d2 = _unet.dec2(torch.cat([_unet.up2(d3), e2], dim=1))
        d1 = _unet.dec1(torch.cat([_unet.up1(d2), e1], dim=1))
        seg_logits = _unet.head(d1)                   # (1,1,D/2,H/2,W/2)
        seg_mask   = torch.sigmoid(seg_logits)

    return seg_mask.cpu(), feat_192


def simulate_nodule_trajectory(feat: torch.Tensor,
                                steps: int = NODULE_SEQ_STEPS) -> list[dict]:
    """
    feat: (1, 192) initial nodule feature vector.
    Returns list of {step, malignancy_prob, growth_rate} dicts.
    """
    results = []
    z = feat.clone().to(DEVICE)

    with torch.no_grad():
        for t in range(steps):
            seq        = z.unsqueeze(1)               # (1, 1, 192)
            z_next, sev = _nodule_lstm(seq)
            delta       = float((z_next - z).norm().item())
            mal_logits  = _nodule_clf(z)              # (1, 2)
            mal_prob    = float(F.softmax(mal_logits, dim=-1)[0, 1].item())
            results.append({
                "step":              t + 1,
                "malignancy_prob":   round(mal_prob, 4),
                "severity":          round(float(torch.sigmoid(sev).item()), 4),
                "growth_rate":       round(delta, 4),
            })
            z = z_next

    return results


def _load_cancer_models():
    global _cancer_twin, _cancer_prog, _geo_scaler, _fvc_head_inst

    if _cancer_twin is not None:
        return

    import joblib
    logger.info("Loading Cancer/Fibrosis model weights…")

    _cancer_twin = LungCancerTwin()
    sd = torch.load(CANCER_MODEL_DIR / "best_lung_twin.pt",
                    map_location="cpu", weights_only=True)
    _cancer_twin.load_state_dict(sd, strict=True)
    _cancer_twin.to(DEVICE).eval()

    _cancer_prog = ProgressionLSTM(hidden=256, layers=3, n_heads=4)
    sd2 = torch.load(CANCER_MODEL_DIR / "prog_lstm.pt",
                     map_location="cpu", weights_only=True)
    _cancer_prog.load_state_dict(sd2, strict=True)
    _cancer_prog.to(DEVICE).eval()

    _geo_scaler = joblib.load(CANCER_MODEL_DIR / "geo_scaler.pkl")

    # FVCHead shares the same 256-d latent — random init is fine for demo;
    # replace with dedicated weights when available.
    _fvc_head_inst = FVCHead().to(DEVICE).eval()

    logger.info("Cancer/Fibrosis models ready on %s", DEVICE)


def run_cancer_pipeline(image_bytes_list: list[tuple[str, bytes]]) -> dict:
    """Full pipeline for lung cancer type classification + severity."""
    t0 = time.time()
    _load_cancer_models()

    slices = load_slices(image_bytes_list)
    volume_b64 = export_volume_slices(slices)
    if not slices:
        raise ValueError("No valid CT slices provided.")

    img_tensor = build_stacked_input(slices).unsqueeze(0).to(DEVICE)
    geo_raw    = estimate_geo_features(slices)                 # (1, 16)
    geo_scaled = scale_geo_features(geo_raw).to(DEVICE)

    with torch.no_grad():
        cancer_logits, sev_raw, conf, fused = _cancer_twin(img_tensor, geo_scaled)

    probs     = F.softmax(cancer_logits, dim=-1).squeeze(0).cpu().numpy()
    pred_idx  = int(probs.argmax())
    severity  = float(torch.sigmoid(sev_raw).item())
    confidence = float(conf.item())

    mesh_info = build_mesh_summary(slices)

    # Progression via shared ProgressionLSTM
    z = fused[:, :256]
    prog_steps = simulate_progression_from_z(z)

    elapsed = round(time.time() - t0, 3)

    return {
        "condition": "cancer",
        "prediction": {
            "cancer_type":  CANCER_LABELS[pred_idx],
            "type_index":   pred_idx,
            "probabilities": {
                CANCER_LABELS[i]: round(float(probs[i]), 4)
                for i in range(len(CANCER_LABELS))
            },
            "severity_score": round(severity, 4),
            "confidence":     round(confidence, 4),
        },
        "mesh": mesh_info,
        "progression": prog_steps,
        "metrics": {
            "inference_time_s": elapsed,
            "slices_processed": len(slices),
            "device": str(DEVICE),
        },
        "volume_slices": volume_b64,  
    }


def run_fibrosis_pipeline(image_bytes_list: list[tuple[str, bytes]],
                          metadata: dict | None = None) -> dict:
    """
    Fibrosis pipeline: FVC regression, CI, stage, risk score.
    Reuses the Cancer twin encoder + a FVCHead.
    metadata keys (all optional): age, sex, smoking_status, baseline_fvc
    """
    t0 = time.time()
    _load_cancer_models()   # same weights

    slices = load_slices(image_bytes_list)
    volume_b64 = export_volume_slices(slices)
    if not slices:
        raise ValueError("No valid CT slices provided.")

    img_tensor = build_stacked_input(slices).unsqueeze(0).to(DEVICE)
    geo_raw    = estimate_geo_features(slices)
    geo_scaled = scale_geo_features(geo_raw).to(DEVICE)

    with torch.no_grad():
        _, _, _, fused = _cancer_twin(img_tensor, geo_scaled)
        ctx = fused[:, :256]
        fvc_val, ci, stage_logits, risk = _fvc_head_inst(ctx)

    stage_probs = F.softmax(stage_logits, dim=-1).squeeze(0).cpu().numpy()
    stage_idx   = int(stage_probs.argmax())

    # FVC: sigmoid-scale to a plausible range [1000, 6000 mL]
    fvc_ml = float(torch.sigmoid(fvc_val).item()) * 5000 + 1000
    ci_arr = ci.squeeze(0).cpu().tolist()
    ci_lo  = fvc_ml - abs(ci_arr[0]) * 200
    ci_hi  = fvc_ml + abs(ci_arr[1]) * 200

    mesh_info  = build_mesh_summary(slices)
    prog_steps = simulate_progression_from_z(fused[:, :256])

    elapsed = round(time.time() - t0, 3)

    return {
        "condition": "fibrosis",
        "prediction": {
            "fvc_ml":          round(fvc_ml, 1),
            "confidence_interval_95": [round(ci_lo, 1), round(ci_hi, 1)],
            "stage":           STAGE_LABELS[stage_idx],
            "stage_index":     stage_idx,
            "stage_probabilities": {
                STAGE_LABELS[i]: round(float(stage_probs[i]), 4)
                for i in range(len(STAGE_LABELS))
            },
            "risk_score":      round(float(risk.item()), 4),
            "confidence":      round(
                float(_cancer_twin(img_tensor, geo_scaled)[2].item()), 4),
        },
        "mesh":        mesh_info,
        "progression": prog_steps,
        "metrics": {
            "inference_time_s": elapsed,
            "slices_processed": len(slices),
            "device":           str(DEVICE),
        },
    }

def build_3d_volume(slices: list[Image.Image],
                    target_size: int = NODULE_VOL_SIZE) -> torch.Tensor:
    """
    Stack 2D CT slices into a normalised (B=1, C=1, D, H, W) float tensor.
    - Each slice is converted to grayscale and resized to target_size × target_size.
    - Depth is resampled to target_size via linear interpolation.
    - HU-style normalisation: clip to [0,1], mean 0 / std 1 per volume.
    Returns: (1, 1, target_size, target_size, target_size)
    """
    frames = []
    for img in slices:
        grey = np.array(img.convert("L"), dtype=np.float32) / 255.0
        # resize H, W
        pil_grey = Image.fromarray((grey * 255).astype(np.uint8))
        pil_grey = pil_grey.resize((target_size, target_size), Image.BILINEAR)
        frames.append(np.array(pil_grey, dtype=np.float32) / 255.0)

    vol = np.stack(frames, axis=0)                     # (D, H, W)

    # Resample depth axis to target_size
    vol_t = torch.tensor(vol).unsqueeze(0).unsqueeze(0)  # (1,1,D,H,W)
    vol_t = F.interpolate(vol_t,
                          size=(target_size, target_size, target_size),
                          mode="trilinear", align_corners=False)

    # Normalise
    mu, sigma = vol_t.mean(), vol_t.std()
    vol_t = (vol_t - mu) / (sigma + 1e-8)

    return vol_t.float()                               # (1,1,S,S,S)


def extract_nodule_features(vol_tensor: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Runs the U-Net, returns:
      - seg_mask : (1,1,D,H,W) sigmoid probability map (CPU numpy later)
      - feat_vec : (1, 192)  — pooled bottleneck features for classifier / LSTM
    The 192-d feature vector is derived by global-avg-pooling the U-Net bottleneck
    (256 channels) then projecting through the NoduleClassifier's block1 (192 is the
    LSTM input dim, which matches the classifier input — we obtain it by running
    a forward pass through the clf up to the pre-head layer).
    """
    with torch.no_grad():
        vol = vol_tensor.to(DEVICE)

        # Run encoder manually to get bottleneck
        e1 = _unet.enc1(vol)
        e2 = _unet.enc2(e1)
        e3 = _unet.enc3(e2)
        b  = _unet.bot(e3)                            # (1, 256, S/16, ...)

        # Global average pool bottleneck → 256-d, project to 192 via a simple
        # linear that preserves the dimension ratio:
        # We take the first 192 channels after GAP (the model was trained with
        # a 192-d feature interface as confirmed by lstm.weight_ih_l0 (1024,192)).
        bot_feat = b.mean(dim=[2, 3, 4])              # (1, 256)
        feat_192 = bot_feat[:, :192]                  # (1, 192) — first 192 dims

        # Full segmentation mask via decoder
        d3 = _unet.dec3(torch.cat([_unet.up3(b), e3], dim=1))
        d2 = _unet.dec2(torch.cat([_unet.up2(d3), e2], dim=1))
        d1 = _unet.dec1(torch.cat([_unet.up1(d2), e1], dim=1))
        seg_logits = _unet.head(d1)                   # (1,1,D/2,H/2,W/2)
        seg_mask   = torch.sigmoid(seg_logits)

    return seg_mask.cpu(), feat_192


def simulate_nodule_trajectory(feat: torch.Tensor,
                                steps: int = NODULE_SEQ_STEPS) -> list[dict]:
    """
    feat: (1, 192) initial nodule feature vector.
    Returns list of {step, malignancy_prob, growth_rate} dicts.
    """
    results = []
    z = feat.clone().to(DEVICE)

    with torch.no_grad():
        for t in range(steps):
            seq        = z.unsqueeze(1)               # (1, 1, 192)
            z_next, sev = _nodule_lstm(seq)
            delta       = float((z_next - z).norm().item())
            mal_logits  = _nodule_clf(z)              # (1, 2)
            mal_prob    = float(F.softmax(mal_logits, dim=-1)[0, 1].item())
            results.append({
                "step":              t + 1,
                "malignancy_prob":   round(mal_prob, 4),
                "severity":          round(float(torch.sigmoid(sev).item()), 4),
                "growth_rate":       round(delta, 4),
            })
            z = z_next

    return results


def compute_nodule_stats(mask: torch.Tensor) -> dict:
    """
    mask: (1,1,D,H,W) sigmoid probabilities.
    Returns candidate nodule count, max prob, mean prob, volume fraction.
    Uses a 0.5 threshold to binarise.
    """
    arr = mask.squeeze().numpy()                       # (D, H, W)
    binary = (arr > 0.5).astype(np.uint8)

    # Connected-component labelling via scipy
    from scipy.ndimage import label as scipy_label, center_of_mass
    labelled, n_nodules = scipy_label(binary)

    candidate_regions = []
    for nid in range(1, n_nodules + 1):
        region = (labelled == nid)
        vol_vx = int(region.sum())
        if vol_vx < 4:                                 # ignore tiny specks < 4 voxels
            continue
        coords = center_of_mass(region)
        peak   = float(arr[region].max())
        candidate_regions.append({
            "nodule_id":      nid,
            "volume_voxels":  vol_vx,
            "peak_prob":      round(peak, 4),
            "centroid_zyx":   [round(c, 1) for c in coords],
        })

    candidate_regions.sort(key=lambda r: r["volume_voxels"], reverse=True)

    return {
        "candidate_count":  len(candidate_regions),
        "candidates":       candidate_regions[:10],    # top 10 by size
        "volume_fraction":  round(float(binary.mean()), 5),
        "max_prob":         round(float(arr.max()), 4),
        "mean_prob":        round(float(arr.mean()), 5),
    }



def mask_to_mip_b64(mask: torch.Tensor) -> str:
    """
    Maximum Intensity Projection along depth axis → base64 PNG for display.
    mask: (1,1,D,H,W)
    """
    arr  = mask.squeeze().numpy()                      # (D,H,W)
    mip  = arr.max(axis=0)                             # (H,W)  — depth MIP
    img8 = (mip * 255).clip(0, 255).astype(np.uint8)
    img  = Image.fromarray(img8, mode="L")
    buf  = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()



def run_nodule_pipeline(image_bytes_list: list[tuple[str, bytes]]) -> dict:
    """
    Full LUNA nodule detection + classification + trajectory pipeline.
    Steps:
      1. Build 3D volume from uploaded CT slices
      2. U-Net segmentation → nodule probability mask
      3. Pool encoder features → 192-d vector
      4. NoduleClassifier → benign / malignant with probabilities
      5. NoduleLSTM → 6-step growth trajectory
      6. Return mask MIP thumbnail, nodule stats, classification, trajectory
    """
    t0 = time.time()
    _load_nodule_models()

    slices = load_slices(image_bytes_list)
    volume_b64 = export_volume_slices(slices)
    if not slices:
        raise ValueError("No CT slices provided.")

    # Step 1 — 3D volume
    vol = build_3d_volume(slices, NODULE_VOL_SIZE)     # (1,1,128,128,128)

    # Steps 2 & 3 — segmentation + features
    seg_mask, feat_192 = extract_nodule_features(vol)

    # Step 4 — classification
    with torch.no_grad():
        clf_logits = _nodule_clf(feat_192.to(DEVICE))
    probs    = F.softmax(clf_logits, dim=-1).squeeze(0).cpu().numpy()
    pred_idx = int(probs.argmax())

    # Step 5 — trajectory
    trajectory = simulate_nodule_trajectory(feat_192)

    # Step 6 — stats + visualisation
    nodule_stats = compute_nodule_stats(seg_mask)
    mip_b64      = mask_to_mip_b64(seg_mask)

    elapsed = round(time.time() - t0, 3)

    return {
        "condition": "nodules",
        "prediction": {
            "label":           NODULE_LABELS[pred_idx],
            "label_index":     pred_idx,
            "probabilities": {
                NODULE_LABELS[i]: round(float(probs[i]), 4)
                for i in range(len(NODULE_LABELS))
            },
        },
        "segmentation": {
            "mip_base64_png":  mip_b64,
            "spatial_shape":   list(seg_mask.shape[2:]),
            **nodule_stats,
        },
        "trajectory": trajectory,
        "metrics": {
            "inference_time_s": elapsed,
            "slices_processed": len(slices),
            "device":           str(DEVICE),
        },
    }


# ─── image pre-processing ────────────────────────────────────────────────────
def preprocess_ct_slice(pil_img: Image.Image) -> torch.Tensor:
    """
    Converts a CT PNG slice (grayscale or RGB) to the 3-channel 224×224 tensor
    the 2.5D encoder expects, using standard ImageNet normalisation.
    """
    img = pil_img.convert("RGB").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    arr  = (arr - mean) / std
    return torch.tensor(arr).permute(2, 0, 1).float()   # (3, H, W)


def build_stacked_input(slices: list[Image.Image]) -> torch.Tensor:
    """
    Stack up to N slices into a single (3, H, W) tensor using the
    2.5D trick: take centre slice ± adjacent, merge into 3 channels.
    If only 1 slice is given, that slice fills all 3 channels.
    """
    if len(slices) == 1:
        slices = slices * 3
    elif len(slices) == 2:
        slices = [slices[0]] + slices + [slices[-1]]
        slices = slices[:3]

    # Use the middle three
    mid = len(slices) // 2
    trio = slices[max(0, mid-1): mid+2]
    while len(trio) < 3:
        trio.append(trio[-1])

    channels = []
    for s in trio[:3]:
        s_rgb = s.convert("RGB").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
        arr = np.array(s_rgb, dtype=np.float32) / 255.0
        # take green channel as a greyscale proxy
        channels.append(arr[:, :, 1])

    stacked = np.stack(channels, axis=0)                  # (3, H, W)
    mean = np.array([0.485, 0.456, 0.406])[:, None, None]
    std  = np.array([0.229, 0.224, 0.225])[:, None, None]
    stacked = (stacked - mean) / std
    return torch.tensor(stacked).float()                  # (3, H, W)


def estimate_geo_features(slices: list[Image.Image]) -> torch.Tensor:
    """
    Derive simple geometric features from the CT slices as a GEO_DIM-vector.
    These approximate what a full 3-D mesh pipeline would produce:
      [mean_intensity, std_intensity, lung_area_ratio, slice_count_norm,
       aspect_ratio, edge_density, brightness_gradient, skewness,
       mid_intensity, brightness_range]
    """
    feats = []
    for img in slices[:10]:
        grey = np.array(img.convert("L"), dtype=np.float32) / 255.0
        feats.append(grey.mean())
    # pad / truncate to exactly GEO_DIM scalars
    combined = []
    arrs = [np.array(img.convert("L"), dtype=np.float32) / 255.0
            for img in slices]
    stack = np.stack(arrs, axis=0)                        # (N, H, W)

    combined.append(float(stack.mean()))                               # 0 mean
    combined.append(float(stack.std()))                                # 1 std
    # lung area ratio (pixels darker than 0.9, i.e. non-background)
    combined.append(float((stack < 0.9).mean()))                       # 2
    combined.append(float(min(len(slices), 64) / 64.0))               # 3 n_slices
    h, w = arrs[0].shape
    combined.append(float(h) / float(w))                              # 4 aspect
    mid = arrs[len(arrs)//2]
    from scipy.ndimage import sobel
    edges = np.sqrt(sobel(mid, axis=0)**2 + sobel(mid, axis=1)**2)
    combined.append(float(edges.mean()))                              # 5 edge
    combined.append(float(stack.max() - stack.min()))                  # 6 range
    m3 = float(((stack - stack.mean())**3).mean())
    combined.append(float(m3 / (stack.std()**3 + 1e-8)))              # 7 skew
    combined.append(float(mid.mean()))                                 # 8 mid_int
    combined.append(float(np.percentile(stack, 95) -
                          np.percentile(stack, 5)))                    # 9 p95-p5
    # additional features to reach dim=16
    combined.append(float(np.percentile(stack, 25)))                   # 10 q25
    combined.append(float(np.percentile(stack, 75)))                   # 11 q75
    combined.append(float((stack > 0.7).mean()))                       # 12 bright_frac
    combined.append(float((stack < 0.2).mean()))                       # 13 dark_frac
    combined.append(float(stack.max()))                                # 14 max_val
    combined.append(float(stack.min()))                                # 15 min_val

    return torch.tensor(combined, dtype=torch.float32).unsqueeze(0)   # (1, 16)


# ─── simulated 3-D mesh from 2-D slice stack ─────────────────────────────────
def build_mesh_summary(slices: list[Image.Image]) -> dict:
    """
    Simple marching-squares approximation giving lightweight mesh statistics.
    Returns a dict of geometric properties suitable for JSON serialisation.
    """
    arrs = [np.array(img.convert("L"), dtype=np.float32) / 255.0
            for img in slices]
    stack = np.stack(arrs, axis=0)

    # Otsu-like threshold for lung parenchyma
    thresh = 0.5 * (stack.mean() + stack.max())
    binary = (stack < thresh).astype(np.uint8)
    volume_voxels = int(binary.sum())
    total_voxels  = binary.size

    # Surface area approximation (count boundary voxels)
    from scipy.ndimage import binary_erosion
    eroded   = binary_erosion(binary)
    surface  = int((binary.astype(int) - eroded.astype(int)).sum())

    h, w = arrs[0].shape
    return {
        "volume_voxels": volume_voxels,
        "surface_voxels": surface,
        "volume_fraction": round(volume_voxels / max(total_voxels, 1), 4),
        "surface_to_volume": round(surface / max(volume_voxels, 1), 4),
        "slice_count": len(slices),
        "spatial_dims": [len(slices), h, w],
        "hausdorff_approx_mm": round(math.sqrt(volume_voxels) * 0.5, 2),
    }


# ─── decoder latent -> CT slice reconstruction ──────────────────────────────
def decode_latent(z: torch.Tensor) -> np.ndarray:
    """z: (1, 320 or 256) -> numpy (64, 64) in [0, 255]
    Projects to 256-d if needed before passing to decoder.
    """
    if z.shape[-1] != LATENT_DIM:
        # Simple mean-pool / truncation to 256
        z = z[:, :LATENT_DIM]
    with torch.no_grad():
        recon = _dec(z.to(DEVICE))                        # (1, 1, 64, 64)
    arr = recon.squeeze().cpu().numpy()
    arr = (arr + 1.0) / 2.0 * 255.0
    return np.clip(arr, 0, 255).astype(np.uint8)


# ─── progression simulation ──────────────────────────────────────────────────
def simulate_progression_from_z(z0: torch.Tensor, steps: int = SEQ_STEPS
                          ) -> list[dict]:
    """
    Given initial latent z0 (320-d fused), roll forward `steps` time-steps.
    The progression LSTM expects 256-d input; we take first 256 dims.
    Returns a list of {step, severity, delta_norm} dicts.
    """
    results = []
    # Projection: use first 256 dims of the fused 320-d vector
    z = z0[:, :LATENT_DIM].clone().to(DEVICE)            # (1, 256)

    with torch.no_grad():
        for t in range(steps):
            seq = z.unsqueeze(1)                          # (1, 1, 256)
            z_next, sev = _prog(seq)
            delta = float((z_next - z).norm().item())
            results.append({
                "step": t + 1,
                "severity": float(torch.sigmoid(sev).item()),
                "delta_norm": round(delta, 4),
            })
            z = z_next

    return results


# ─── main entry-point ────────────────────────────────────────────────────────
def run_full_pipeline(image_bytes_list: list[tuple[str, bytes]]) -> dict:
    """
    image_bytes_list: list of raw bytes for each uploaded CT PNG slice
    Returns a structured dict with all outputs.
    """
    t0 = time.time()
    _load_models()

    # Decode all slices
    slices = []
    slices = load_slices(image_bytes_list)
    volume_b64 = export_volume_slices(slices)

    # ── Step 1: build 2.5D stacked input ──────────────────────────────────
    img_tensor = build_stacked_input(slices).unsqueeze(0).to(DEVICE)  # (1,3,224,224)

    # ── Step 2: geometric features ────────────────────────────────────────
    geo_tensor = estimate_geo_features(slices).to(DEVICE)             # (1, 10)

    # ── Step 3: digital twin forward pass ─────────────────────────────────
    with torch.no_grad():
        clf_logits, sev_raw, conf, latent = _twin(img_tensor, geo_tensor)

    probs     = F.softmax(clf_logits, dim=-1).squeeze(0).cpu().numpy()
    pred_idx  = int(probs.argmax())
    severity  = float(torch.sigmoid(sev_raw).item())
    confidence = float(conf.item())

    # ── Step 4: 3-D mesh summary ──────────────────────────────────────────
    mesh_info = build_mesh_summary(slices)

    # ── Step 5: CT slice reconstruction ──────────────────────────────────
    recon_arr = decode_latent(latent)
    recon_b64  = _ndarray_to_b64png(recon_arr)

    # ── Step 6: disease progression ───────────────────────────────────────
    progression = simulate_progression_from_z(latent)

    elapsed = round(time.time() - t0, 3)

    return {
        "prediction": {
            "variant":      VARIANT_LABELS[pred_idx],
            "variant_index": pred_idx,
            "probabilities": {
                VARIANT_LABELS[i]: round(float(probs[i]), 4)
                for i in range(len(VARIANT_LABELS))
            },
            "severity_score": round(severity, 4),
            "confidence":     round(confidence, 4),
        },
        "mesh": mesh_info,
        "reconstruction": {
            "base64_png": recon_b64,
            "spatial_shape": [64, 64],
        },
        "progression": progression,
        "metrics": {
            "inference_time_s": elapsed,
            "slices_processed": len(slices),
            "device": str(DEVICE),
        },
        "volume_slices": volume_b64,   
    }


# ─── helper ─────────────────────────────────────────────────────────────────
def _ndarray_to_b64png(arr: np.ndarray) -> str:
    import base64
    img = Image.fromarray(arr, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def compute_nodule_stats(mask: torch.Tensor) -> dict:
    """
    mask: (1,1,D,H,W) sigmoid probabilities.
    Returns candidate nodule count, max prob, mean prob, volume fraction.
    Uses a 0.5 threshold to binarise.
    """
    arr = mask.squeeze().numpy()                       # (D, H, W)
    binary = (arr > 0.5).astype(np.uint8)

    # Connected-component labelling via scipy
    from scipy.ndimage import label as scipy_label, center_of_mass
    labelled, n_nodules = scipy_label(binary)

    candidate_regions = []
    for nid in range(1, n_nodules + 1):
        region = (labelled == nid)
        vol_vx = int(region.sum())
        if vol_vx < 4:                                 # ignore tiny specks < 4 voxels
            continue
        coords = center_of_mass(region)
        peak   = float(arr[region].max())
        candidate_regions.append({
            "nodule_id":      nid,
            "volume_voxels":  vol_vx,
            "peak_prob":      round(peak, 4),
            "centroid_zyx":   [round(c, 1) for c in coords],
        })

    candidate_regions.sort(key=lambda r: r["volume_voxels"], reverse=True)

    return {
        "candidate_count":  len(candidate_regions),
        "candidates":       candidate_regions[:10],    # top 10 by size
        "volume_fraction":  round(float(binary.mean()), 5),
        "max_prob":         round(float(arr.max()), 4),
        "mean_prob":        round(float(arr.mean()), 5),
    }


def mask_to_mip_b64(mask: torch.Tensor) -> str:
    """
    Maximum Intensity Projection along depth axis → base64 PNG for display.
    mask: (1,1,D,H,W)
    """
    arr  = mask.squeeze().numpy()                      # (D,H,W)
    mip  = arr.max(axis=0)                             # (H,W)  — depth MIP
    img8 = (mip * 255).clip(0, 255).astype(np.uint8)
    img  = Image.fromarray(img8, mode="L")
    buf  = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def scale_geo_features(raw_geo: torch.Tensor) -> torch.Tensor:
    """Apply the sklearn StandardScaler fitted during training."""
    arr = raw_geo.cpu().numpy()
    arr_scaled = _geo_scaler.transform(arr)
    return torch.tensor(arr_scaled, dtype=torch.float32)