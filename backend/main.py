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


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading COVID models…")
    _load_models()
    logger.info("Loading Cancer/Fibrosis models…")
    _load_cancer_models()
    logger.info("Loading OSIC Fibrosis models…")
    _load_osic_models()
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
    

@app.post("/predict/fibrosis", tags=["inference"])
async def predict_fibrosis(
    files: List[UploadFile] = File(...),
    age: int = 65,
    sex: str = "Male",
    smoking_status: str = "Ex-smoker",
    baseline_fvc: float = 2600.0,
    weeks: float = 0.0,
):
    """
    OSIC Pulmonary Fibrosis Digital Twin.
    Outputs: FVC regression (mL), 95% CI, stage (mild/moderate/severe),
             risk score, 7-step decline trajectory.

    Optional metadata query params:
      age (int, default 65)
      sex (str: "Male" | "Female", default "Male")
      smoking_status (str: "Never" | "Ex-smoker" | "Currently", default "Ex-smoker")
      baseline_fvc (float mL, default 2600.0)
      weeks (float, weeks since baseline scan, default 0.0)
    """
    raw_bytes = [(f.filename or "", await f.read()) for f in files]
    try:
        return JSONResponse(content=run_osic_fibrosis_pipeline(
            raw_bytes, age=age, sex=sex,
            smoking_status=smoking_status,
            baseline_fvc=baseline_fvc,
            weeks=weeks,
        ))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("OSIC fibrosis pipeline error: %s", e)
        raise HTTPException(status_code=500, detail="Fibrosis inference failed.")
    

@app.post("/predict/cancer", tags=["inference"])
async def predict_cancer(files: List[UploadFile] = File(...)):
    """
    Cancer type classification from CT slices.
    Returns: cancer_type (4-class), severity, confidence, mesh, progression.
    """
    raw_bytes = [(f.filename or "", await f.read()) for f in files]
    try:
        return JSONResponse(content=run_cancer_pipeline(raw_bytes))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Cancer pipeline error: %s", e)
        raise HTTPException(status_code=500, detail="Cancer inference failed.")


@app.post("/predict/fibrosis", tags=["inference"])
async def predict_fibrosis(
    files: List[UploadFile] = File(...),
    age: int = 0,
    sex: str = "unknown",
    smoking_status: str = "unknown",
    baseline_fvc: float = 0.0,
):
    """
    Pulmonary fibrosis analysis: FVC regression, CI, stage (mild/moderate/severe), risk score.
    Optional metadata: age, sex, smoking_status, baseline_fvc.
    """
    raw_bytes = [(f.filename or "", await f.read()) for f in files]
    metadata  = {"age": age, "sex": sex,
                 "smoking_status": smoking_status, "baseline_fvc": baseline_fvc}
    
    
    try:
        return JSONResponse(content=run_osic_fibrosis_pipeline(raw_bytes, metadata))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Fibrosis pipeline error: %s", e)
        raise HTTPException(status_code=500, detail="Fibrosis inference failed.")
    
"""
LUNA nodule detection from CT slices.
Runs 3D U-Net segmentation, nodule classification (benign/malignant),
and LSTM growth trajectory simulation.
Returns: label, probabilities, segmentation MIP thumbnail,
            candidate nodule list (centroid, volume, peak prob),
            6-step trajectory.
"""

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
