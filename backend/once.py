# run this once from backend/ with your venv active

import asyncio
import base64
import motor.motor_asyncio
import os
import io

from pathlib import Path
from dotenv import load_dotenv
from PIL import Image

import pydicom
import numpy as np

load_dotenv()

client = motor.motor_asyncio.AsyncIOMotorClient(
    os.getenv("MONGO_URI")
)

db = client["lungtwin"]


async def upload_scan(title, condition, folder_path, metadata=None):
    folder = Path(folder_path)
    slices_b64 = []

    dcm_files = sorted(folder.glob("*.dcm"))
    if not dcm_files:
        print("No .dcm files found!")
        return

    parsed = []
    for f in dcm_files:
        ds = pydicom.dcmread(str(f))

        # ── Step 1: convert raw pixels to Hounsfield Units ──────────
        arr = ds.pixel_array.astype(np.float32)
        slope     = float(getattr(ds, "RescaleSlope",     1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept

        # ── Step 2: apply lung window (WL=-600, WW=1500) ────────────
        lo, hi = -1350.0, 150.0        # WL-WW/2, WL+WW/2
        arr = np.clip(arr, lo, hi)

        # ── Step 3: normalise to [0, 255] uint8 ─────────────────────
        arr = (arr - lo) / (hi - lo) * 255.0
        arr = arr.astype(np.uint8)

        # ── Step 4: sort key from InstanceNumber tag ─────────────────
        try:
            sort_key = int(ds.InstanceNumber)
        except Exception:
            digits = ''.join(filter(str.isdigit, f.name))
            sort_key = int(digits) if digits else 0

        img = Image.fromarray(arr, mode="L").resize((128, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        parsed.append((sort_key, base64.b64encode(buf.getvalue()).decode()))

    # ── Step 5: sort by InstanceNumber before storing ────────────────
    parsed.sort(key=lambda x: x[0])
    slices_b64 = [b64 for _, b64 in parsed]

    mid = len(slices_b64) // 2
    await db.sample_scans.insert_one({
        "title":       title,
        "condition":   condition,
        "description": f"{len(slices_b64)} CT slices — HU windowed",
        "tags":        [condition],
        "slice_count": len(slices_b64),
        "thumbnail":   slices_b64[mid],
        "slices":      slices_b64,
        "metadata":    metadata or {},
        "source":      "uploaded",
    })
    print(f"Uploaded {len(slices_b64)} slices for '{title}'")


asyncio.run(
    upload_scan(
        "COVID Neg",
        "covid19",
        r"D:\Downloads\CT Scans\Case_001"
    )
)
