"""
Unit tests for PyTorch model architecture definitions.
"""

import pytest
import torch
import torch.nn as nn


class TestCovidDigitalTwin:

    @pytest.fixture
    def model(self):
        from models import CovidDigitalTwin
        return CovidDigitalTwin().eval()

    def test_forward_shapes(self, model):
        imgs = torch.randn(1, 3, 224, 224)
        geo  = torch.randn(1, 16)
        clf, sev, conf, fused = model(imgs, geo)
        assert clf.shape   == (1, 2)
        assert sev.shape   == (1,)
        assert conf.shape  == (1,)
        assert fused.shape == (1, 320)

    def test_clf_is_raw_logits(self, model):
        imgs = torch.randn(2, 3, 224, 224)
        geo  = torch.randn(2, 16)
        clf, *_ = model(imgs, geo)
        # logits can be any real value — not necessarily in [0,1]
        assert clf.shape == (2, 2)

    def test_conf_in_unit_range(self, model):
        imgs = torch.randn(1, 3, 224, 224)
        geo  = torch.randn(1, 16)
        _, _, conf, _ = model(imgs, geo)
        assert 0.0 <= float(conf) <= 1.0

    def test_batch_size_2(self, model):
        imgs = torch.randn(2, 3, 224, 224)
        geo  = torch.randn(2, 16)
        clf, sev, conf, fused = model(imgs, geo)
        assert clf.shape[0] == 2


class TestProgressionLSTM:

    @pytest.fixture
    def model(self):
        from models import ProgressionLSTM
        return ProgressionLSTM(hidden=256, layers=3, n_heads=4).eval()

    def test_forward_shapes(self, model):
        x = torch.randn(1, 1, 256)
        next_state, severity = model(x)
        assert next_state.shape == (1, 256)
        assert severity.shape   == (1,)

    # def test_sequence_length_6(self, model):
    #     x = torch.randn(4, 6, 256)
    #     next_state, severity = model(x)
    #     assert next_state.shape[0] == 4

    # def test_severity_unconstrained(self, model):
    #     x = torch.randn(1, 1, 256)
    #     _, sev = model(x)
    #     assert sev.shape == (1,)


# class TestCTDecoder:

#     @pytest.fixture
#     def model(self):
#         from models import CTDecoder
#         return CTDecoder().eval()

#     def test_output_shape(self, model):
#         z = torch.randn(1, 256)
#         out = model(z)
#         assert out.shape == (1, 1, 64, 64)

#     def test_output_in_tanh_range(self, model):
#         z = torch.randn(2, 256)
#         out = model(z)
#         assert float(out.min()) >= -1.0
#         assert float(out.max()) <=  1.0

#     def test_batch_of_4(self, model):
#         z = torch.randn(4, 256)
#         out = model(z)
#         assert out.shape == (4, 1, 64, 64)


# class TestLungCancerTwin:

#     @pytest.fixture
#     def model(self):
#         from models import LungCancerTwin
#         return LungCancerTwin().eval()

#     def test_forward_shapes(self, model):
#         imgs = torch.randn(1, 3, 224, 224)
#         geo  = torch.randn(1, 16)
#         cancer, sev, conf, fused = model(imgs, geo)
#         assert cancer.shape == (1, 4)
#         assert fused.shape  == (1, 320)

#     def test_conf_in_range(self, model):
#         imgs = torch.randn(1, 3, 224, 224)
#         geo  = torch.randn(1, 16)
#         _, _, conf, _ = model(imgs, geo)
#         assert 0.0 <= float(conf) <= 1.0


# class TestOSICFibrosisTwin:

    @pytest.fixture
    def model(self):
        from models import OSICFibrosisTwin
        return OSICFibrosisTwin().eval()

    def test_forward_shapes(self, model):
        imgs = torch.randn(1, 3, 224, 224)
        meta = torch.randn(1, 5)
        stage, fvc, risk, conf, fused = model(imgs, meta)
        assert stage.shape == (1, 3)
        assert fvc.shape   == (1,)
        assert risk.shape  == (1,)
        assert conf.shape  == (1,)

    def test_risk_in_unit_range(self, model):
        imgs = torch.randn(1, 3, 224, 224)
        meta = torch.randn(1, 5)
        _, _, risk, _, _ = model(imgs, meta)
        assert 0.0 <= float(risk) <= 1.0

    def test_batch_size_4(self, model):
        imgs = torch.randn(4, 3, 224, 224)
        meta = torch.randn(4, 5)
        stage, *_ = model(imgs, meta)
        assert stage.shape[0] == 4