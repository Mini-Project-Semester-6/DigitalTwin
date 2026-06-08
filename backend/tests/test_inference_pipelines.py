"""
Integration tests for end-to-end inference pipelines.
"""

import pytest
import torch
import numpy as np
from unittest.mock import patch, MagicMock

from conftest import make_slice_list, make_file_tuples


def _mock_twin(n_classes=2):
    m = MagicMock()
    def fwd(imgs, geo, seq_len=5):
        B = imgs.shape[0]
        return (
            torch.randn(B, n_classes),
            torch.rand(B),
            torch.rand(B),
            torch.randn(B, 320),
        )
    m.__call__ = fwd
    m.return_value = fwd(torch.randn(1,3,224,224), torch.randn(1,16))
    m.side_effect = None
    return m


class TestCovidPipeline:

    def test_pipeline_returns_all_keys(self):
        from inference import run_full_pipeline
        files = make_file_tuples(8)

        mock_twin = MagicMock()
        mock_twin.return_value = (
            torch.randn(1, 2), torch.rand(1), torch.rand(1), torch.randn(1, 320))
        mock_prog = MagicMock()
        mock_prog.return_value = (torch.randn(1,256), torch.rand(1))
        mock_dec  = MagicMock()
        mock_dec.return_value  = torch.randn(1, 1, 64, 64)

        with patch("inference._twin", mock_twin), \
             patch("inference._prog", mock_prog), \
             patch("inference._dec",  mock_dec), \
             patch("inference._load_models"):
            result = run_full_pipeline(files)

        for key in ["prediction", "mesh", "reconstruction", "progression",
                    "volume_data", "metrics"]:
            assert key in result, f"Missing key: {key}"

    def test_prediction_has_probabilities(self):
        from inference import run_full_pipeline
        files = make_file_tuples(4)

        with patch("inference._twin") as t, \
             patch("inference._prog") as p, \
             patch("inference._dec")  as d, \
             patch("inference._load_models"):
            t.return_value = (torch.randn(1,2), torch.rand(1), torch.rand(1), torch.randn(1,320))
            p.return_value = (torch.randn(1,256), torch.rand(1))
            d.return_value = torch.randn(1,1,64,64)
            result = run_full_pipeline(files)

        assert "probabilities" in result["prediction"]
        assert len(result["prediction"]["probabilities"]) == 2

    def test_raises_on_empty_files(self):
        from inference import run_full_pipeline
        with patch("inference._load_models"):
            with pytest.raises(ValueError):
                run_full_pipeline([])

    def test_progression_has_7_steps(self):
        from inference import run_full_pipeline
        files = make_file_tuples(8)
        with patch("inference._twin") as t, \
             patch("inference._prog") as p, \
             patch("inference._dec")  as d, \
             patch("inference._load_models"):
            t.return_value = (torch.randn(1,2), torch.rand(1), torch.rand(1), torch.randn(1,320))
            p.return_value = (torch.randn(1,256), torch.rand(1))
            d.return_value = torch.randn(1,1,64,64)
            result = run_full_pipeline(files)
        assert len(result["progression"]) == 7

    def test_metrics_includes_inference_time(self):
        from inference import run_full_pipeline
        files = make_file_tuples(8)
        with patch("inference._twin") as t, \
             patch("inference._prog") as p, \
             patch("inference._dec")  as d, \
             patch("inference._load_models"):
            t.return_value = (torch.randn(1,2), torch.rand(1), torch.rand(1), torch.randn(1,320))
            p.return_value = (torch.randn(1,256), torch.rand(1))
            d.return_value = torch.randn(1,1,64,64)
            result = run_full_pipeline(files)
        assert "inference_time_s" in result["metrics"]
        assert result["metrics"]["slices_processed"] == 8


# class TestCancerPipeline:

#     def _run(self, files):
#         from inference import run_cancer_pipeline
#         with patch("inference._cancer_twin") as t, \
#              patch("inference._cancer_prog") as p, \
#              patch("inference._geo_scaler") as sc, \
#              patch("inference._load_cancer_models"):
#             t.return_value = (torch.randn(1,4), torch.rand(1), torch.rand(1), torch.randn(1,320))
#             p.return_value = (torch.randn(1,256), torch.rand(1))
#             sc.transform.return_value = np.zeros((1,16), dtype=np.float32)
#             return run_cancer_pipeline(files)

#     def test_returns_cancer_type(self):
#         result = self._run(make_file_tuples(8))
#         assert "cancer_type" in result["prediction"]

#     def test_four_class_probabilities(self):
#         result = self._run(make_file_tuples(8))
#         assert len(result["prediction"]["probabilities"]) == 4

#     def test_condition_is_cancer(self):
#         result = self._run(make_file_tuples(8))
#         assert result["condition"] == "cancer"

#     def test_raises_on_empty(self):
#         from inference import run_cancer_pipeline
#         with patch("inference._load_cancer_models"):
#             with pytest.raises(ValueError):
#                 run_cancer_pipeline([])


# class TestFibrosisPipeline:

    def _run(self, files, **kwargs):
        from inference import run_osic_fibrosis_pipeline
        with patch("inference._osic_twin") as t, \
             patch("inference._load_osic_models"):
            t.return_value = (torch.randn(1,3), torch.rand(1), torch.rand(1), torch.rand(1), torch.randn(1,320))
            t.fvc_head.return_value = torch.rand(1,1)
            t.risk_head.return_value = torch.rand(1,1)
            t.stage_head.return_value = torch.randn(1,3)
            return run_osic_fibrosis_pipeline(files, **kwargs)

    def test_fvc_ml_in_clinical_range(self):
        result = self._run(make_file_tuples(8), age=65, sex="Male",
                           smoking_status="Ex-smoker", baseline_fvc=2600.0, weeks=0.0)
        fvc = result["prediction"]["fvc_ml"]
        assert 1000 <= fvc <= 6500

    def test_ci_lo_less_than_hi(self):
        result = self._run(make_file_tuples(8))
        ci = result["prediction"]["confidence_interval_95"]
        assert ci[0] < ci[1]

    def test_stage_labels_valid(self):
        result = self._run(make_file_tuples(8))
        assert result["prediction"]["stage"] in ["Mild", "Moderate", "Severe"]

    def test_condition_is_fibrosis(self):
        result = self._run(make_file_tuples(8))
        assert result["condition"] == "fibrosis"

    def test_metadata_echoed_back(self):
        result = self._run(make_file_tuples(8), age=72, sex="Female",
                           smoking_status="Never", baseline_fvc=3000.0, weeks=4.0)
        meta = result["metadata_used"]
        assert meta["age"] == 72
        assert meta["sex"] == "Female"