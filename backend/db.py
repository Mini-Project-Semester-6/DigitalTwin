"""
db.py — MongoDB Atlas connection and sample scan helpers.
Uses Motor (async pymongo) so it integrates cleanly with FastAPI.
"""

import os
import io
import base64
import logging
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env") 

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        # Read lazily so Render's injected env vars are available at connection time
        mongo_uri = os.getenv("MONGO_URI", "")
        if not mongo_uri:
            raise RuntimeError(
                "MONGO_URI is not set. Add it in Render Dashboard â Environment."
            )
        _client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=8000)
        logger.info("MongoDB Atlas client initialised")
    return _client


def get_db():
    mongo_db = os.getenv("MONGO_DB", "lungtwin")
    return get_client()[mongo_db]


# ── Collection schemas ─────────────────────────────────────────────────────
# Collection: sample_scans
# Each document:
# {
#   "_id":        ObjectId,
#   "title":      str,          e.g. "COVID-Positive Sample #1"
#   "condition":  str,          "covid19" | "cancer" | "fibrosis" | "nodules"
#   "description":str,
#   "tags":       list[str],
#   "slice_count":int,
#   "thumbnail":  str,          base64 PNG of the middle slice
#   "slices":     list[str],    list of base64-encoded PNG slice strings
#                               OR store as GridFS file_ids (see below)
#   "metadata":   dict,         fibrosis clinical metadata if applicable
#   "source":     str,          dataset name e.g. "OSIC", "LUNA16"
#   "created_at": datetime,
# }


async def list_sample_scans(condition: str | None = None) -> list[dict]:
    """
    Return all sample scans (without the heavy slices[] array).
    Optionally filter by condition.
    """
    db     = get_db()
    query  = {"condition": condition} if condition else {}
    cursor = db.sample_scans.find(
        query,
        projection={"slices": 0}       # exclude heavy slice data from listing
    ).sort("condition", 1)

    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])   # convert ObjectId → str for JSON
        results.append(doc)
    return results


async def get_sample_scan(scan_id: str) -> dict | None:
    """
    Return a single sample scan including all slice data.
    """
    from bson import ObjectId
    db  = get_db()
    doc = await db.sample_scans.find_one({"_id": ObjectId(scan_id)})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def get_sample_scan_bytes(scan_id: str) -> tuple[list[tuple[str, bytes]], dict]:
    """
    Fetch a sample scan and return its slices as (filename, bytes) tuples
    ready to pass directly into the inference pipelines.
    Also returns the metadata dict (for fibrosis).
    """
    doc = await get_sample_scan(scan_id)
    if not doc:
        raise ValueError(f"Sample scan {scan_id} not found")

    file_tuples = []
    for idx, b64 in enumerate(doc.get("slices", [])):
        raw = base64.b64decode(b64)
        filename = f"slice_{idx:04d}.png"
        file_tuples.append((filename, raw))

    return file_tuples, doc.get("metadata", {})


async def seed_sample_scans_if_empty(slices_dir: str | None = None):
    """
    Idempotent seeder. If the sample_scans collection is empty,
    insert placeholder documents. In production replace with your
    actual CT PNG slices encoded as base64.

    slices_dir: optional path to a local folder of PNG slices to seed.
    If None, inserts lightweight placeholder documents with a grey PNG.
    """
    db    = get_db()
    count = await db.sample_scans.count_documents({})
    if count > 0:
        logger.info("sample_scans already seeded (%d docs)", count)
        return

    logger.info("Seeding sample_scans collection…")

    # Create a minimal 128x128 grey placeholder PNG (1 KB)
    placeholder_b64 = _grey_png_b64(128, 128)

    from datetime import datetime, timezone
    samples = [
        {
            "title":       "COVID-Positive Sample",
            "condition":   "covid19",
            "description": "Axial CT slices showing bilateral ground-glass opacities typical of COVID-19 pneumonia.",
            "tags":        ["COVID-19", "GGO", "bilateral"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {},
            "source":      "COVID-19 CT Scan Dataset (Kaggle)",
            "created_at":  datetime.now(timezone.utc),
        },
        {
            "title":       "COVID-Negative (Normal) Sample",
            "condition":   "covid19",
            "description": "Normal lung CT with no pathological findings. Used as a negative control.",
            "tags":        ["Normal", "control"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {},
            "source":      "COVID-19 CT Scan Dataset (Kaggle)",
            "created_at":  datetime.now(timezone.utc),
        },
        {
            "title":       "Lung Adenocarcinoma Sample",
            "condition":   "cancer",
            "description": "CT slices of a confirmed adenocarcinoma case with peripheral spiculated nodule.",
            "tags":        ["Adenocarcinoma", "nodule", "spiculated"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {},
            "source":      "LUNA16 / LIDC-IDRI",
            "created_at":  datetime.now(timezone.utc),
        },
        {
            "title":       "Squamous Cell Carcinoma Sample",
            "condition":   "cancer",
            "description": "Central mass in the right upper lobe consistent with squamous cell carcinoma.",
            "tags":        ["Squamous Cell", "central mass", "RUL"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {},
            "source":      "LUNA16 / LIDC-IDRI",
            "created_at":  datetime.now(timezone.utc),
        },
        {
            "title":       "Pulmonary Fibrosis — Moderate Stage",
            "condition":   "fibrosis",
            "description": "OSIC dataset patient with moderate IPF. Peripheral honeycombing pattern bilaterally.",
            "tags":        ["IPF", "honeycombing", "moderate"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {
                "age": 68, "sex": "Male",
                "smoking_status": "Ex-smoker",
                "baseline_fvc": 2340.0,
                "weeks": 0,
            },
            "source":      "OSIC Pulmonary Fibrosis Progression",
            "created_at":  datetime.now(timezone.utc),
        },
        {
            "title":       "Pulmonary Fibrosis — Mild Stage",
            "condition":   "fibrosis",
            "description": "Early-stage fibrosis with limited basal reticulation and no honeycombing.",
            "tags":        ["IPF", "mild", "basal reticulation"],
            "slice_count": 5,
            "thumbnail":   placeholder_b64,
            "slices":      [placeholder_b64] * 5,
            "metadata":    {
                "age": 61, "sex": "Female",
                "smoking_status": "Never",
                "baseline_fvc": 3100.0,
                "weeks": 0,
            },
            "source":      "OSIC Pulmonary Fibrosis Progression",
            "created_at":  datetime.now(timezone.utc),
        },
    ]

    await db.sample_scans.insert_many(samples)
    # Create index for fast condition queries
    await db.sample_scans.create_index("condition")
    logger.info("Seeded %d sample scans", len(samples))


def _grey_png_b64(w: int, h: int) -> str:
    """Generate a minimal grey PNG as base64 string."""
    import struct, zlib

    def png_chunk(tag: bytes, data: bytes) -> bytes:
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", c)

    raw = b"".join(b"\x00" + bytes([80] * w) for _ in range(h))
    compressed = zlib.compress(raw)
    png  = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += png_chunk(b"IDAT", compressed)
    png += png_chunk(b"IEND", b"")
    return base64.b64encode(png).decode()