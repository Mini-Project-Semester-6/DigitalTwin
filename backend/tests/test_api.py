"""
Integration tests for the FastAPI REST endpoints.
"""

import io
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from conftest import make_grey_png, make_file_tuples


def _png_file(name="slice.png"):
    return (name, io.BytesIO(make_grey_png()), "image/png")


class TestHealthEndpoint:

    def test_health_returns_200(self, app_client):
        resp = app_client.get("/health")
        assert resp.status_code == 200

    def test_health_returns_ok(self, app_client):
        resp = app_client.get("/health")
        assert resp.json()["status"] == "ok"


class TestModelInfoEndpoint:

    def test_model_info_200(self, app_client):
        resp = app_client.get("/model-info")
        assert resp.status_code == 200

    def test_model_info_has_models_key(self, app_client):
        resp = app_client.get("/model-info")
        assert "models" in resp.json()

    def test_model_info_lists_three_models(self, app_client):
        resp = app_client.get("/model-info")
        assert len(resp.json()["models"]) >= 3


class TestPredictCovid:
    """Tests for POST /predict (condition=covid19)"""

    def test_returns_200_with_valid_png(self, app_client, mock_covid_result):
        with patch("main.run_full_pipeline", return_value=mock_covid_result):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[("files", _png_file())]
            )
        assert resp.status_code == 200

    def test_response_has_prediction_key(self, app_client, mock_covid_result):
        with patch("main.run_full_pipeline", return_value=mock_covid_result):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[("files", _png_file())]
            )
        assert "prediction" in resp.json()

    def test_response_has_progression(self, app_client, mock_covid_result):
        with patch("main.run_full_pipeline", return_value=mock_covid_result):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[("files", _png_file())]
            )
        assert "progression" in resp.json()
        assert len(resp.json()["progression"]) == 7

    def test_422_on_no_files(self, app_client):
        resp = app_client.post("/predict?condition=covid19")
        assert resp.status_code == 422

    def test_503_for_nodules_condition(self, app_client):
        resp = app_client.post(
            "/predict?condition=nodules",
            files=[("files", _png_file())]
        )
        assert resp.status_code == 503

    def test_invalid_file_content_returns_500(self, app_client):
        with patch("main.run_full_pipeline", side_effect=Exception("inference failed")):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[("files", ("bad.png", io.BytesIO(b"not a png"), "image/png"))]
            )
        assert resp.status_code == 500

    def test_value_error_returns_422(self, app_client):
        with patch("main.run_full_pipeline", side_effect=ValueError("No CT slices")):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[("files", _png_file())]
            )
        assert resp.status_code == 422

    def test_multiple_slices_accepted(self, app_client, mock_covid_result):
        with patch("main.run_full_pipeline", return_value=mock_covid_result):
            resp = app_client.post(
                "/predict?condition=covid19",
                files=[
                    ("files", _png_file("s1.png")),
                    ("files", _png_file("s2.png")),
                    ("files", _png_file("s3.png")),
                ]
            )
        assert resp.status_code == 200


# class TestPredictCancer:
#     """Tests for POST /predict/cancer"""

#     def test_returns_200(self, app_client, mock_cancer_result):
#         with patch("main.run_cancer_pipeline", return_value=mock_cancer_result):
#             resp = app_client.post(
#                 "/predict/cancer",
#                 files=[("files", _png_file())]
#             )
#         assert resp.status_code == 200

#     def test_cancer_type_in_response(self, app_client, mock_cancer_result):
#         with patch("main.run_cancer_pipeline", return_value=mock_cancer_result):
#             resp = app_client.post(
#                 "/predict/cancer",
#                 files=[("files", _png_file())]
#             )
#         pred = resp.json()["prediction"]
#         assert "cancer_type" in pred
#         assert pred["cancer_type"] == "Adenocarcinoma"

#     def test_four_class_probabilities(self, app_client, mock_cancer_result):
#         with patch("main.run_cancer_pipeline", return_value=mock_cancer_result):
#             resp = app_client.post(
#                 "/predict/cancer",
#                 files=[("files", _png_file())]
#             )
#         probs = resp.json()["prediction"]["probabilities"]
#         assert len(probs) == 4

#     def test_422_on_no_files(self, app_client):
#         resp = app_client.post("/predict/cancer")
#         assert resp.status_code == 422


# class TestPredictFibrosis:
#     """Tests for POST /predict/fibrosis"""

#     def test_returns_200(self, app_client, mock_fibrosis_result):
#         with patch("main.run_osic_fibrosis_pipeline", return_value=mock_fibrosis_result):
#             resp = app_client.post(
#                 "/predict/fibrosis?age=68&sex=Male&smoking_status=Ex-smoker&baseline_fvc=2340&weeks=0",
#                 files=[("files", _png_file())]
#             )
#         assert resp.status_code == 200

#     def test_fvc_in_response(self, app_client, mock_fibrosis_result):
#         with patch("main.run_osic_fibrosis_pipeline", return_value=mock_fibrosis_result):
#             resp = app_client.post(
#                 "/predict/fibrosis",
#                 files=[("files", _png_file())]
#             )
#         pred = resp.json()["prediction"]
#         assert "fvc_ml" in pred
#         assert "confidence_interval_95" in pred
#         assert "stage" in pred

#     def test_ci_has_two_values(self, app_client, mock_fibrosis_result):
#         with patch("main.run_osic_fibrosis_pipeline", return_value=mock_fibrosis_result):
#             resp = app_client.post(
#                 "/predict/fibrosis",
#                 files=[("files", _png_file())]
#             )
#         ci = resp.json()["prediction"]["confidence_interval_95"]
#         assert len(ci) == 2
#         assert ci[0] < ci[1]

#     def test_stage_is_valid(self, app_client, mock_fibrosis_result):
#         with patch("main.run_osic_fibrosis_pipeline", return_value=mock_fibrosis_result):
#             resp = app_client.post(
#                 "/predict/fibrosis",
#                 files=[("files", _png_file())]
#             )
#         assert resp.json()["prediction"]["stage"] in ["Mild", "Moderate", "Severe"]

#     def test_metadata_used_in_response(self, app_client, mock_fibrosis_result):
#         with patch("main.run_osic_fibrosis_pipeline", return_value=mock_fibrosis_result):
#             resp = app_client.post(
#                 "/predict/fibrosis",
#                 files=[("files", _png_file())]
#             )
#         assert "metadata_used" in resp.json()

#     def test_missing_files_returns_422(self, app_client):
#         resp = app_client.post("/predict/fibrosis")
#         assert resp.status_code == 422


# class TestPredictNodules:

#     def test_nodules_returns_503(self, app_client):
#         resp = app_client.post(
#             "/predict/nodules",
#             files=[("files", _png_file())]
#         )
#         assert resp.status_code == 503

#     def test_nodules_detail_message(self, app_client):
#         resp = app_client.post(
#             "/predict/nodules",
#             files=[("files", _png_file())]
#         )
#         assert "disabled" in resp.json()["detail"].lower()


class TestSamplesEndpoints:
    """Tests for MongoDB sample scan endpoints."""

    def test_list_samples_200(self, app_client):
        with patch("main.list_sample_scans", new_callable=AsyncMock,
                   return_value=[{"_id": "abc", "title": "Test", "condition": "covid19"}]):
            resp = app_client.get("/samples")
        assert resp.status_code == 200

    def test_list_samples_returns_count(self, app_client):
        with patch("main.list_sample_scans", new_callable=AsyncMock,
                   return_value=[{"_id": "abc", "title": "Test", "condition": "covid19"}]):
            resp = app_client.get("/samples")
        body = resp.json()
        assert "count" in body
        assert body["count"] == 1

    # def test_list_samples_filter_by_condition(self, app_client):
    #     with patch("main.list_sample_scans", new_callable=AsyncMock, return_value=[]):
    #         resp = app_client.get("/samples?condition=cancer")
    #     assert resp.status_code == 200

    def test_get_sample_404_for_unknown_id(self, app_client):
        with patch("main.get_sample_scan", new_callable=AsyncMock, return_value=None):
            resp = app_client.get("/samples/nonexistentid")
        assert resp.status_code == 404

    def test_predict_from_sample_200(self, app_client, mock_covid_result):
        with patch("main.get_sample_scan_bytes", new_callable=AsyncMock,
                   return_value=(make_file_tuples(5), {})), \
             patch("main.run_full_pipeline", return_value=mock_covid_result):
            resp = app_client.post("/samples/fakeid123/predict?condition=covid19")
        assert resp.status_code == 200

    def test_predict_from_sample_404_unknown(self, app_client):
        with patch("main.get_sample_scan_bytes", new_callable=AsyncMock,
                   side_effect=ValueError("not found")):
            resp = app_client.post("/samples/badid/predict?condition=covid19")
        assert resp.status_code == 404


class TestFilenamePassthrough:
    """Verify that FastAPI passes (filename, bytes) tuples to pipelines."""

    def test_filename_tuple_passed_to_pipeline(self, app_client, mock_covid_result):
        captured = {}
        def fake_pipeline(files):
            captured["files"] = files
            return mock_covid_result

        with patch("main.run_full_pipeline", side_effect=fake_pipeline):
            app_client.post(
                "/predict?condition=covid19",
                files=[("files", ("myscan.png", io.BytesIO(make_grey_png()), "image/png"))]
            )

        assert len(captured["files"]) == 1
        fname, raw = captured["files"][0]
        assert fname == "myscan.png"
        assert isinstance(raw, bytes)