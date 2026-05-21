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

    # Read all DICOM files
    dcm_files = sorted(folder.glob("*.dcm"))

    if not dcm_files:
        print("No .dcm files found!")
        return

    for f in dcm_files:

        # Load DICOM
        ds = pydicom.dcmread(f)

        # Extract pixel array
        img_array = ds.pixel_array.astype(float)

        # Normalize to 0–255
        img_array = (
            np.maximum(img_array, 0) / img_array.max()
        ) * 255.0

        img_array = np.uint8(img_array)

        # Convert to PIL image
        img = Image.fromarray(img_array)

        # Convert grayscale + resize
        img = img.convert("L").resize((128, 128))

        # Convert to base64
        buf = io.BytesIO()
        img.save(buf, format="PNG")

        slices_b64.append(
            base64.b64encode(buf.getvalue()).decode()
        )

    await db.sample_scans.insert_one({
        "title": title,
        "condition": condition,
        "description": f"{len(slices_b64)} CT slices",
        "tags": [condition],
        "slice_count": len(slices_b64),
        "thumbnail": slices_b64[len(slices_b64)//2],
        "slices": slices_b64,
        "metadata": metadata or {},
        "source": "uploaded",
    })

    print(f"Uploaded {len(slices_b64)} slices for '{title}'")


asyncio.run(
    upload_scan(
        "Fibrosis Pos",
        "fibrosis",
        r"D:\Downloads\CT Scans\Case_001"
    )
)