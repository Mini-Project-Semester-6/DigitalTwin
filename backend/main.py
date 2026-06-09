"""
main.py – FastAPI server for the Lung Digital Twin COVID-19 predictor.
"""

import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from inference import (run_full_pipeline, run_cancer_pipeline,
                       run_osic_fibrosis_pipeline,
                       run_nodule_pipeline,
                       _load_models, _load_cancer_models,
                       _load_nodule_models, _load_osic_models)

from db import get_db, list_sample_scans, get_sample_scan, get_sample_scan_bytes, seed_sample_scans_if_empty

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Models are loaded lazily on first request — keeps startup RAM under 512 MB.
    # Each _load_*() function is idempotent (checks if already loaded before loading).
    try:
        await seed_sample_scans_if_empty()
        logger.info("MongoDB Atlas connected")
    except Exception as e:
        logger.warning("MongoDB unavailable (sample scans disabled): %s", e)
    yield


app = FastAPI(
    title="Lung Digital Twin – COVID-19 Predictor",
    version="1.0.0",
    description=(
        "2.5D CNN encoder + Digital Twin LSTM pipeline for "
        "COVID-19 variant classification, severity scoring, "
        "3-D lung mesh reconstruction, and future-state simulation."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "message": "Lung Digital Twin API running"}


@app.post("/predict", tags=["inference"])
async def predict(
    files: List[UploadFile] = File(...),
    condition: str = "covid19",   
):
    raw_bytes = [(f.filename or "", await f.read()) for f in files]
    try:
        if condition == "cancer":
            return JSONResponse(content=run_cancer_pipeline(raw_bytes))
        elif condition == "fibrosis":
            return JSONResponse(content=run_osic_fibrosis_pipeline(raw_bytes))
        elif condition == "nodules":
            raise HTTPException(
                status_code=503,
                detail="Nodule detection is temporarily disabled."
            )
        else:
            return JSONResponse(content=run_full_pipeline(raw_bytes))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Pipeline error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed.")
    

@app.get("/model-info", tags=["system"])
async def model_info():
    """Return architecture summary."""
    return {
        "models": [
            {
                "name": "CovidDigitalTwin",
                "file": "best_covid_twin.pt",
                "backbone": "EfficientNet-B0 (2.5D)",
                "outputs": ["variant_logits", "severity", "confidence", "latent"],
            },
            {
                "name": "ProgressionLSTM",
                "file": "best_prog_lstm.pt",
                "layers": 3,
                "hidden_dim": 256,
                "outputs": ["next_latent", "future_severity"],
            },
            {
                "name": "CTDecoder",
                "file": "ct_decoder.pt",
                "input_dim": 256,
                "output": "64x64 CT reconstruction",
            },
        ]
    }


@app.get("/samples", tags=["samples"])
async def list_samples(condition: str | None = None):
    """
    List all available sample CT scans (no slice data, just metadata + thumbnail).
    Optionally filter by condition: covid19 | cancer | fibrosis | nodules
    """
    try:
        samples = await list_sample_scans(condition)
        return JSONResponse(content={"samples": samples, "count": len(samples)})
    except Exception as e:
        logger.exception("Failed to list samples: %s", e)
        raise HTTPException(status_code=503, detail="Sample database unavailable.")


@app.get("/samples/{scan_id}", tags=["samples"])
async def get_sample(scan_id: str):
    """
    Get metadata for a single sample scan (without running inference).
    """
    try:
        doc = await get_sample_scan(scan_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Sample not found.")
        doc.pop("slices", None)   # don't send raw slices in metadata call
        return JSONResponse(content=doc)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_sample error: %s", e)
        raise HTTPException(status_code=503, detail="Sample database unavailable.")


@app.post("/samples/{scan_id}/predict", tags=["samples"])
async def predict_from_sample(
    scan_id: str,
    condition: str = "covid19",
    age: int = 65,
    sex: str = "Male",
    smoking_status: str = "Ex-smoker",
    baseline_fvc: float = 2600.0,
    weeks: float = 0.0,
):
    """
    Run the full inference pipeline on a stored sample scan.
    The scan's own metadata is used for fibrosis if present.
    """
    try:
        file_tuples, scan_meta = await get_sample_scan_bytes(scan_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Sample fetch error: %s", e)
        raise HTTPException(status_code=503, detail="Sample database unavailable.")

    # Use metadata stored in the document if available
    if scan_meta:
        age            = scan_meta.get("age",            age)
        sex            = scan_meta.get("sex",            sex)
        smoking_status = scan_meta.get("smoking_status", smoking_status)
        baseline_fvc   = scan_meta.get("baseline_fvc",  baseline_fvc)
        weeks          = scan_meta.get("weeks",          weeks)

    try:
        if condition == "cancer":
            result = run_cancer_pipeline(file_tuples)
        elif condition == "fibrosis":
            result = run_osic_fibrosis_pipeline(
                file_tuples, age=age, sex=sex,
                smoking_status=smoking_status,
                baseline_fvc=baseline_fvc, weeks=weeks)
        elif condition == "nodules":
            raise HTTPException(status_code=503, detail="Nodule detection temporarily disabled.")
        else:
            result = run_full_pipeline(file_tuples)
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Sample inference error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed.")
