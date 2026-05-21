"""
Shared pytest fixtures for unit and integration tests.
"""

import io
import base64
import struct
import zlib
import pytest
import numpy as np
from PIL import Image
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


# ── Helpers ────────────────────────────────────────────────────────────────

def make_grey_png(width=128, height=128, value=80) -> bytes:
    """Return a minimal valid PNG as bytes."""
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = b"".join(b"\x00" + bytes([value] * width) for _ in range(height))
    png  = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw))
    png += chunk(b"IEND", b"")
    return png


def make_slice_list(n=8, width=224, height=224) -> list:
    """Return n PIL Image objects."""
    return [Image.fromarray(
        np.random.randint(0, 200, (height, width), dtype=np.uint8), mode="L"
    ).convert("RGB") for _ in range(n)]


def make_file_tuples(n=8) -> list:
    """Return (filename, bytes) tuples as expected by load_slices."""
    return [(f"slice_{i:04d}.png", make_grey_png()) for i in range(n)]


@pytest.fixture
def grey_png_bytes():
    return make_grey_png()


@pytest.fixture
def slice_pil_list():
    return make_slice_list(8)


@pytest.fixture
def file_tuples():
    return make_file_tuples(8)


@pytest.fixture
def mock_covid_result():
    return {
        "condition": "covid19",
        "prediction": {
            "variant": "COVID-Positive",
            "variant_index": 1,
            "probabilities": {"COVID-Negative": 0.05, "COVID-Positive": 0.95},
            "severity_score": 0.72,
            "confidence": 0.88,
        },
        "mesh": {
            "volume_voxels": 50000,
            "surface_voxels": 4000,
            "volume_fraction": 0.31,
            "surface_to_volume": 0.08,
            "hausdorff_approx_mm": 112.0,
            "slice_count": 8,
            "spatial_dims": [8, 128, 128],
        },
        "reconstruction": {"base64_png": base64.b64encode(make_grey_png(64, 64)).decode(), "spatial_shape": [64, 64]},
        "progression": [{"step": i, "severity": 0.5 + i * 0.02, "delta_norm": 0.1} for i in range(1, 8)],
        "volume_data": {
            "voxels_b64": base64.b64encode(np.zeros(128*128*32, dtype=np.float32).tobytes()).decode(),
            "dims": [32, 128, 128],
            "spacing": [1.5, 1.0, 1.0],
            "legacy_slices": [],
        },
        "metrics": {"inference_time_s": 3.5, "slices_processed": 8, "device": "cpu"},
    }


@pytest.fixture
def mock_cancer_result():
    return {
        "condition": "cancer",
        "prediction": {
            "cancer_type": "Adenocarcinoma",
            "type_index": 0,
            "probabilities": {
                "Adenocarcinoma": 0.70, "Squamous Cell": 0.10,
                "Small Cell": 0.10, "Normal": 0.10,
            },
            "severity_score": 0.65,
            "confidence": 0.82,
        },
        "mesh": {"volume_voxels": 60000, "surface_voxels": 5000, "volume_fraction": 0.33,
                 "surface_to_volume": 0.083, "hausdorff_approx_mm": 120.0,
                 "slice_count": 8, "spatial_dims": [8, 128, 128]},
        "progression": [{"step": i, "severity": 0.6, "delta_norm": 0.12} for i in range(1, 8)],
        "metrics": {"inference_time_s": 4.2, "slices_processed": 8, "device": "cpu"},
    }


@pytest.fixture
def mock_fibrosis_result():
    return {
        "condition": "fibrosis",
        "model": "OSIC Digital Twin",
        "prediction": {
            "fvc_ml": 2450.0,
            "confidence_interval_95": [1900.0, 3000.0],
            "stage": "Moderate",
            "stage_index": 1,
            "stage_probabilities": {"Mild": 0.20, "Moderate": 0.70, "Severe": 0.10},
            "risk_score": 0.55,
            "confidence": 0.80,
        },
        "metadata_used": {"age": 68, "sex": "Male", "smoking_status": "Ex-smoker",
                          "baseline_fvc": 2340.0, "weeks": 0},
        "mesh": {"volume_voxels": 45000, "surface_voxels": 3600, "volume_fraction": 0.29,
                 "surface_to_volume": 0.08, "hausdorff_approx_mm": 100.0,
                 "slice_count": 8, "spatial_dims": [8, 128, 128]},
        "progression": [{"step": i, "fvc_ml": 2450 - i * 18, "risk": 0.55,
                         "stage": "Moderate", "stage_probs": {}} for i in range(1, 8)],
        "metrics": {"inference_time_s": 3.8, "slices_processed": 8, "device": "cpu"},
    }


@pytest.fixture
def app_client():
    """FastAPI TestClient with all model loaders mocked."""
    with patch("main._load_models"), \
         patch("main._load_cancer_models"), \
         patch("main._load_osic_models"), \
         patch("main._load_nodule_models"), \
         patch("main.seed_sample_scans_if_empty", new_callable=AsyncMock):
        from main import app
        with TestClient(app) as client:
            yield client