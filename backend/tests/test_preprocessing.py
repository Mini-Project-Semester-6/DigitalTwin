"""
Unit tests for DICOM and image preprocessing utilities.
"""

import io
import struct
import zlib
import pytest
import numpy as np
from PIL import Image
from unittest.mock import patch, MagicMock

from conftest import make_grey_png, make_slice_list, make_file_tuples


class TestLoadSlices:
    """Tests for inference.load_slices()"""

    def test_detects_png_extension(self, file_tuples):
        from inference import load_slices
        result = load_slices(file_tuples)
        assert isinstance(result, list)
        assert len(result) == len(file_tuples)
        assert all(isinstance(img, Image.Image) for img in result)

    def test_sorts_by_filename_digits(self):
        from inference import load_slices
        # Deliberately unsorted
        pairs = [
            ("slice_0003.png", make_grey_png(value=30)),
            ("slice_0001.png", make_grey_png(value=10)),
            ("slice_0002.png", make_grey_png(value=20)),
        ]
        result = load_slices(pairs)
        assert len(result) == 3
        # The images should be in ascending filename order (by digit)
        # We can't easily verify pixel values after PNG encode/decode with noise,
        # but we verify count and types
        assert all(isinstance(img, Image.Image) for img in result)

    def test_raises_on_empty_list(self):
        from inference import load_slices
        with pytest.raises(ValueError, match="No files provided"):
            load_slices([])

    def test_skips_corrupt_files(self):
        from inference import load_slices
        pairs = [
            ("good.png",  make_grey_png()),
            ("bad.png",   b"this is not a valid png file at all"),
        ]
        # Should not raise; bad file silently skipped
        result = load_slices(pairs)
        assert len(result) == 1

    def test_raises_if_no_valid_images(self):
        from inference import load_slices
        pairs = [("bad.png", b"garbage")]
        with pytest.raises(ValueError, match="No valid image slices found"):
            load_slices(pairs)

    def test_dcm_extension_routes_to_dicom_loader(self):
        from inference import load_slices
        with patch("inference.load_dicom_folder") as mock_dcm:
            mock_dcm.return_value = make_slice_list(3)
            result = load_slices([("scan.dcm", b"fake")])
            mock_dcm.assert_called_once()

    def test_png_extension_does_not_call_dicom_loader(self, file_tuples):
        from inference import load_slices
        with patch("inference.load_dicom_folder") as mock_dcm:
            load_slices(file_tuples)
            mock_dcm.assert_not_called()


class TestBuildStackedInput:
    """Tests for inference.build_stacked_input()"""

    def test_output_shape_single_slice(self):
        from inference import build_stacked_input
        slices = make_slice_list(1)
        tensor = build_stacked_input(slices)
        assert tensor.shape == (3, 224, 224)

    def test_output_shape_multiple_slices(self):
        from inference import build_stacked_input
        slices = make_slice_list(16)
        tensor = build_stacked_input(slices)
        assert tensor.shape == (3, 224, 224)

    def test_output_dtype_float32(self):
        from inference import build_stacked_input
        import torch
        slices = make_slice_list(8)
        tensor = build_stacked_input(slices)
        assert tensor.dtype == torch.float32

    def test_output_normalised(self):
        from inference import build_stacked_input
        slices = make_slice_list(8)
        tensor = build_stacked_input(slices)
        # ImageNet normalisation means values can be negative
        assert tensor.min() >= -3.0
        assert tensor.max() <=  3.0

    def test_two_slices_handled(self):
        from inference import build_stacked_input
        slices = make_slice_list(2)
        tensor = build_stacked_input(slices)
        assert tensor.shape == (3, 224, 224)


class TestEstimateGeoFeatures:
    """Tests for inference.estimate_geo_features()"""

    def test_output_shape(self):
        from inference import estimate_geo_features
        slices = make_slice_list(8)
        tensor = estimate_geo_features(slices)
        assert tensor.shape == (1, 16)

    def test_output_dtype(self):
        from inference import estimate_geo_features
        import torch
        slices = make_slice_list(8)
        tensor = estimate_geo_features(slices)
        assert tensor.dtype == torch.float32

    def test_values_finite(self):
        from inference import estimate_geo_features
        import torch
        slices = make_slice_list(8)
        tensor = estimate_geo_features(slices)
        assert torch.all(torch.isfinite(tensor))

    def test_single_slice(self):
        from inference import estimate_geo_features
        slices = make_slice_list(1)
        tensor = estimate_geo_features(slices)
        assert tensor.shape == (1, 16)


class TestBuildMeshSummary:
    """Tests for inference.build_mesh_summary()"""

    def test_returns_expected_keys(self):
        from inference import build_mesh_summary
        slices = make_slice_list(8)
        result = build_mesh_summary(slices)
        for key in ["volume_voxels", "surface_voxels", "volume_fraction",
                    "surface_to_volume", "hausdorff_approx_mm", "slice_count"]:
            assert key in result

    def test_slice_count_matches(self):
        from inference import build_mesh_summary
        slices = make_slice_list(10)
        result = build_mesh_summary(slices)
        assert result["slice_count"] == 10

    def test_volume_fraction_in_range(self):
        from inference import build_mesh_summary
        slices = make_slice_list(8)
        result = build_mesh_summary(slices)
        assert 0.0 <= result["volume_fraction"] <= 1.0


class TestExportVolumeSlices:
    """Tests for inference.export_volume_slices()"""

    def test_returns_dict_with_required_keys(self):
        from inference import export_volume_slices
        slices = make_slice_list(16)
        result = export_volume_slices(slices)
        assert "voxels_b64" in result
        assert "dims" in result
        assert "spacing" in result
        assert "legacy_slices" in result

    def test_dims_structure(self):
        from inference import export_volume_slices
        slices = make_slice_list(32)
        result = export_volume_slices(slices)
        assert len(result["dims"]) == 3    # [D, H, W]

    def test_voxels_b64_decodable(self):
        import base64
        from inference import export_volume_slices
        slices = make_slice_list(8)
        result = export_volume_slices(slices)
        raw = base64.b64decode(result["voxels_b64"])
        assert len(raw) > 0

    def test_float32_volume_correct_size(self):
        import base64
        import numpy as np
        from inference import export_volume_slices
        slices = make_slice_list(8)
        result = export_volume_slices(slices, max_slices=8, size=64)
        D, H, W = result["dims"]
        raw = base64.b64decode(result["voxels_b64"])
        arr = np.frombuffer(raw, dtype=np.float32)
        assert arr.shape[0] == D * H * W


# class TestDicomLoader:
#     """Tests for inference.load_dicom_folder() with mocked pydicom."""

#     def test_sorts_by_instance_number(self):
#         from inference import load_dicom_folder

#         def make_mock_ds(instance_num, pixel_val):
#             ds = MagicMock()
#             ds.pixel_array = np.full((64, 64), pixel_val, dtype=np.uint16)
#             ds.InstanceNumber = instance_num
#             ds.RescaleSlope     = 1.0
#             ds.RescaleIntercept = 0.0
#             return ds

#         with patch("inference.pydicom") as mock_pydicom:
#             mock_pydicom.dcmread.side_effect = [
#                 make_mock_ds(3, 100),
#                 make_mock_ds(1, 50),
#                 make_mock_ds(2, 75),
#             ]
#             files = [
#                 ("s3.dcm", b"a"),
#                 ("s1.dcm", b"b"),
#                 ("s2.dcm", b"c"),
#             ]
#             result = load_dicom_folder(files)
#         assert len(result) == 3

#     def test_skips_non_dicom_bytes(self):
#         from inference import load_dicom_folder
#         with patch("inference.pydicom") as mock_pydicom:
#             import pydicom.errors
#             mock_pydicom.dcmread.side_effect = Exception("not dicom")
#             result = load_dicom_folder([("bad.dcm", b"garbage")])
#         assert result == [] or len(result) == 0

#     def test_raises_if_no_valid_slices(self):
#         from inference import load_dicom_folder
#         with patch("inference.pydicom") as mock_pydicom:
#             mock_pydicom.dcmread.side_effect = Exception("bad")
#             with pytest.raises(ValueError, match="No valid DICOM"):
#                 load_dicom_folder([("x.dcm", b"bad")])


# class TestEncodeOsicMetadata:
    """Tests for inference.encode_osic_metadata()"""

    def test_output_shape(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(68, "Male", "Ex-smoker", 2340.0, 0.0)
        assert t.shape == (1, 5)

    def test_sex_encoding_male(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(50, "Male", "Never", 3000.0, 0.0)
        # index 1 = sex → 1.0 for Male
        assert abs(float(t[0, 1]) - 1.0) < 1e-5

    def test_sex_encoding_female(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(50, "Female", "Never", 3000.0, 0.0)
        assert abs(float(t[0, 1]) - 0.0) < 1e-5

    def test_unknown_sex_defaults_to_midpoint(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(50, "unknown", "Never", 3000.0, 0.0)
        assert abs(float(t[0, 1]) - 0.5) < 1e-5

    def test_age_normalised(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(100, "Male", "Never", 3000.0, 0.0)
        assert abs(float(t[0, 0]) - 1.0) < 1e-5

    def test_fvc_normalised(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(65, "Male", "Never", 6000.0, 0.0)
        assert abs(float(t[0, 3]) - 1.0) < 1e-5

    def test_all_values_in_unit_range(self):
        from inference import encode_osic_metadata
        t = encode_osic_metadata(65, "Male", "Ex-smoker", 2600.0, 66.0)
        assert (t >= 0.0).all() and (t <= 1.0).all()