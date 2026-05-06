"""
Model architecture definitions that exactly match the saved .pt weights.

Inferred from state dict inspection:
- best_covid_twin.pt: img_enc (EfficientNet-B0 backbone, proj), geo_enc, fusion, 
                       temporal (2-layer LSTM + attn), clf_head (3-class), 
                       sev_head, conf_head
- best_prog_lstm.pt:  3-layer LSTM(256->256) + multi-head attn + proj + sev
- ct_decoder.pt:      fc(256->1024) + 4-stage ConvTranspose2d decoder
"""

import torch
import torch.nn as nn
import timm

# ─── Exact shapes from state dict inspection ─────────────────────────────────
# img_enc.proj.0.weight: (256, 1280) → proj: Linear(1280→256) + LayerNorm(256)
# geo_enc.net.0.weight:  (128, 16)   → in_dim=16, hidden=128
# geo_enc.net.4.weight:  (64, 128)   → out=64
# fusion.0.weight:       (320, 320)  → fused dim = 256+64 = 320 → 320
# temporal.lstm.weight_ih_l0: (1024, 320) → input=320 (fused)
# clf_head.3.weight:     (2, 128)    → 2 classes (COVID / Not-COVID)
# sev_head.0.weight:     (64, 256)   → Linear(256→64)
# conf_head.0.weight:    (32, 256)   → Linear(256→32) + Linear(32→1)

# ─── 2.5D Image Encoder (EfficientNet-B0 backbone) ─────────────────────────
class ImageEncoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.bb = timm.create_model("efficientnet_b0", pretrained=False, in_chans=3)
        feat_dim = self.bb.classifier.in_features          # 1280
        self.bb.classifier = nn.Identity()
        self.proj = nn.Sequential(
            nn.Linear(feat_dim, 256),   # → 256
            nn.LayerNorm(256),
        )

    def forward(self, x):                                  # x: (B, 3, H, W)
        f = self.bb(x)                                     # (B, 1280)
        return self.proj(f)                                # (B, 256)


# ─── Geometric / volumetric feature encoder ─────────────────────────────────
# net.0: Linear(16→128), net.1: LN(128), net.4: Linear(128→64), net.5: LN(64)
class GeoEncoder(nn.Module):
    def __init__(self, in_dim: int = 16, hidden: int = 128, out_dim: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),   # 0
            nn.LayerNorm(hidden),        # 1
            nn.SiLU(),                   # 2
            nn.Dropout(0.1),             # 3
            nn.Linear(hidden, out_dim),  # 4
            nn.LayerNorm(out_dim),       # 5
        )

    def forward(self, x):
        return self.net(x)


# ─── Temporal LSTM head (inside digital twin) ───────────────────────────────
# lstm input = fused_dim = 320, attn: Linear(256→64) + Tanh + Linear(64→1)
class TemporalHead(nn.Module):
    def __init__(self, lstm_input: int = 320, hidden: int = 256, layers: int = 2):
        super().__init__()
        self.lstm = nn.LSTM(lstm_input, hidden, num_layers=layers,
                            batch_first=True, dropout=0.2)
        self.attn = nn.Sequential(
            nn.Linear(hidden, 64),    # 0
            nn.Tanh(),                # 1
            nn.Linear(64, 1),         # 2
        )
        self.norm = nn.LayerNorm(hidden)

    def forward(self, x):                                  # x: (B, T, lstm_input)
        out, _ = self.lstm(x)
        w = torch.softmax(self.attn(out), dim=1)
        ctx = (w * out).sum(dim=1)
        return self.norm(ctx)                              # (B, 256)


# ─── Full COVID Digital Twin ─────────────────────────────────────────────────
class CovidDigitalTwin(nn.Module):
    # State dict has clf_head.3.weight: (2,128) → binary COVID / Not-COVID
    NUM_CLASSES = 2

    def __init__(self):
        super().__init__()
        self.img_enc = ImageEncoder()       # → (B, 256)
        self.geo_enc = GeoEncoder(16, 128, 64)  # → (B, 64)

        # fusion: 256 + 64 = 320 → 320
        self.fusion = nn.Sequential(
            nn.Linear(320, 320),
            nn.LayerNorm(320),
        )

        # temporal lstm: input=320, hidden=256
        self.temporal = TemporalHead(lstm_input=320, hidden=256, layers=2)

        # clf: Linear(256→128) + SiLU + Dropout + Linear(128→2)
        self.clf_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(128, self.NUM_CLASSES),
        )
        # sev: Linear(256→64) + SiLU + Dropout + Linear(64→1)
        self.sev_head = nn.Sequential(
            nn.Linear(256, 64),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )
        # conf: Linear(256→32) + Linear(32→1)   [indices 0,2 → Dense,Dense]
        self.conf_head = nn.Sequential(
            nn.Linear(256, 32),
            nn.SiLU(),
            nn.Linear(32, 1),
        )

    def forward(self, imgs, geo, seq_len: int = 5):
        img_feat = self.img_enc(imgs)                       # (B, 256)
        geo_feat = self.geo_enc(geo)                        # (B, 64)
        fused    = self.fusion(torch.cat([img_feat, geo_feat], dim=-1))  # (B,320)

        # Expand into a pseudo-sequence for the temporal head
        seq = fused.unsqueeze(1).expand(-1, seq_len, -1)   # (B, T, 320)
        ctx = self.temporal(seq)                            # (B, 256)

        clf  = self.clf_head(ctx)                           # (B, 2)  logits
        sev  = self.sev_head(ctx).squeeze(-1)               # (B,)
        conf = torch.sigmoid(self.conf_head(ctx)).squeeze(-1)
        return clf, sev, conf, fused                        # latent is fused (320)


# ─── Progression LSTM (standalone) ──────────────────────────────────────────
class ProgressionLSTM(nn.Module):
    """
    3-layer LSTM with multi-head self-attention + projection
    Input: (B, T, 256)   Output: next-state (B, 256) + severity (B, 1)
    """
    def __init__(self, hidden: int = 256, layers: int = 3, n_heads: int = 4):
        super().__init__()
        self.lstm = nn.LSTM(hidden, hidden, num_layers=layers,
                            batch_first=True, dropout=0.2)
        self.attn = nn.MultiheadAttention(hidden, num_heads=n_heads,
                                          batch_first=True)
        self.norm = nn.LayerNorm(hidden)
        self.proj = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.SiLU(),
            nn.Linear(hidden, hidden),
        )
        self.sev = nn.Sequential(
            nn.Linear(hidden, 64),
            nn.SiLU(),
            nn.Linear(64, 1),
        )

    def forward(self, x):                                  # (B, T, 256)
        out, _ = self.lstm(x)
        attn_out, _ = self.attn(out, out, out)
        ctx = self.norm(attn_out[:, -1])                   # last time-step
        next_state = self.proj(ctx)
        severity   = self.sev(ctx).squeeze(-1)
        return next_state, severity


# ─── CT Decoder ─────────────────────────────────────────────────────────────
class CTDecoder(nn.Module):
    """
    Decodes a 256-d latent vector -> 2D CT-slice reconstruction
    fc: 256 -> 1024  then reshape -> (B, 64, 4, 4)
    4 ConvTranspose2d stages: 64->32->16->8->1 channel, upsample x4 each
    Final spatial: 4 * 4^4 = 4*256 = 64... actually 4*(4^4)=1024? No:
    4x4 -> upsample(stride=2,k=4) -> 8x8 -> 16x16 -> 32x32 -> 64x64
    Wait stride=2 k=4 gives (4-1)*2 - 2*0 + 4 = 10? Let's use the actual weights.
    dec.0: ConvTranspose2d(64->32, k=4) 
    """
    def __init__(self, latent_dim: int = 256):
        super().__init__()
        self.fc = nn.Sequential(nn.Linear(latent_dim, 1024))
        self.dec = nn.Sequential(
            nn.ConvTranspose2d(64, 32, kernel_size=4, stride=2, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.ConvTranspose2d(32, 16, kernel_size=4, stride=2, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.ConvTranspose2d(16, 8, kernel_size=4, stride=2, padding=1),
            nn.BatchNorm2d(8),
            nn.ReLU(),
            nn.ConvTranspose2d(8, 1, kernel_size=4, stride=2, padding=1),
            nn.Tanh(),
        )

    def forward(self, z):                                  # (B, 256)
        h = self.fc(z)                                     # (B, 1024)
        h = h.view(-1, 64, 4, 4)                          # (B, 64, 4, 4)
        return self.dec(h)                                  # (B, 1, 64, 64)


# ─── Cancer Lung Twin (EfficientNet-B2 backbone) ────────────────────────────
class CancerImageEncoder(nn.Module):
    """EfficientNet-B2: conv_head outputs 1408 channels."""
    def __init__(self):
        super().__init__()
        self.bb = timm.create_model("efficientnet_b2", pretrained=False, in_chans=3)
        feat_dim = self.bb.classifier.in_features   # 1408
        self.bb.classifier = nn.Identity()
        self.proj = nn.Sequential(
            nn.Linear(feat_dim, 256),
            nn.LayerNorm(256),
        )

    def forward(self, x):
        return self.proj(self.bb(x))   # (B, 256)


class CancerTemporalHead(nn.Module):
    """3-layer LSTM: input=320 (fused), hidden=256."""
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(320, 256, num_layers=3, batch_first=True, dropout=0.2)
        self.attn = nn.Sequential(
            nn.Linear(256, 64),
            nn.Tanh(),
            nn.Linear(64, 1),
        )
        self.norm = nn.LayerNorm(256)

    def forward(self, x):          # x: (B, T, 320)
        out, _ = self.lstm(x)
        w = torch.softmax(self.attn(out), dim=1)
        return self.norm((w * out).sum(dim=1))


class LungCancerTwin(nn.Module):
    """
    Full Cancer digital twin.
    State-dict heads: cancer_head (4-class), severity_head (regression), conf_head.
    """
    NUM_CANCER_TYPES = 4   # e.g. Adenocarcinoma/SCC/SCLC/Normal

    def __init__(self):
        super().__init__()
        self.img_enc   = CancerImageEncoder()
        self.geo_enc   = GeoEncoder(16, 128, 64)    # reuse from COVID twin

        self.fusion = nn.Sequential(
            nn.Linear(320, 320),
            nn.LayerNorm(320),
        )
        self.temporal  = CancerTemporalHead()

        # cancer_head: Linear(256→128) + SiLU + Dropout + Linear(128→4)
        self.cancer_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(128, self.NUM_CANCER_TYPES),
        )
        # severity_head: Linear(256→64) + SiLU + Dropout + Linear(64→1)
        self.severity_head = nn.Sequential(
            nn.Linear(256, 64),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )
        # conf_head: Linear(256→32) + SiLU + Linear(32→1)
        self.conf_head = nn.Sequential(
            nn.Linear(256, 32),
            nn.SiLU(),
            nn.Linear(32, 1),
        )

    def forward(self, imgs, geo, seq_len: int = 5):
        img_feat = self.img_enc(imgs)                          # (B, 256)
        geo_feat = self.geo_enc(geo)                          # (B, 64)
        fused    = self.fusion(
            torch.cat([img_feat, geo_feat], dim=-1))          # (B, 320)
        seq = fused.unsqueeze(1).expand(-1, seq_len, -1)      # (B, T, 320)
        ctx = self.temporal(seq)                               # (B, 256)
        cancer = self.cancer_head(ctx)                         # (B, 4)
        sev    = self.severity_head(ctx).squeeze(-1)           # (B,)
        conf   = torch.sigmoid(self.conf_head(ctx)).squeeze(-1)
        return cancer, sev, conf, fused


# ─── Fibrosis Lung Twin (EfficientNet-B2, reuses same arch as Cancer twin) ──
# The uploaded best_lung_twin.pt / prog_lstm.pt are the same file set used for
# both Cancer and Fibrosis until dedicated fibrosis weights are provided.
# The FVC/stage heads below are adapted from the same latent space.

class FVCHead(nn.Module):
    """
    Fibrosis-specific heads bolted onto the shared LungCancerTwin latent.
    fvc_head:   Linear(256→128) + SiLU + Linear(128→1)   — FVC regression (mL)
    ci_head:    Linear(256→128) + SiLU + Linear(128→2)   — [lower, upper] 95% CI
    stage_head: Linear(256→64)  + SiLU + Linear(64→3)    — mild/moderate/severe
    risk_head:  Linear(256→64)  + SiLU + Linear(64→1)    — risk score [0,1]
    """
    def __init__(self):
        super().__init__()
        self.fvc_head = nn.Sequential(
            nn.Linear(256, 128), nn.SiLU(), nn.Linear(128, 1))
        self.ci_head  = nn.Sequential(
            nn.Linear(256, 128), nn.SiLU(), nn.Linear(128, 2))
        self.stage_head = nn.Sequential(
            nn.Linear(256, 64), nn.SiLU(), nn.Linear(64, 3))
        self.risk_head  = nn.Sequential(
            nn.Linear(256, 64), nn.SiLU(), nn.Linear(64, 1))

    def forward(self, ctx):
        fvc   = self.fvc_head(ctx).squeeze(-1)            # (B,)
        ci    = self.ci_head(ctx)                         # (B, 2)
        stage = self.stage_head(ctx)                      # (B, 3)  logits
        risk  = torch.sigmoid(self.risk_head(ctx)).squeeze(-1)
        return fvc, ci, stage, risk
    

# ─── LUNA Nodule Detection ───────────────────────────────────────────────────
# Shared 3D SE-Residual block used across encoder, bottleneck, and decoder

class SEResBlock3d(nn.Module):
    """
    Actual saved structure (confirmed from missing/unexpected key analysis):
      conv.0 : Conv3d(C, C, 3, pad=1)   — no BN after it
      conv.1 : ReLU
      conv.2 : Conv3d(C, C, 3, pad=1)   — no BN after it
      se.fc.0 : AdaptiveAvgPool3d(1)
      se.fc.1 : Flatten
      se.fc.2 : Linear(C → C//4)        ← has weight/bias
      se.fc.3 : ReLU
      se.fc.4 : Linear(C//4 → C)        ← has weight/bias
      se.fc.5 : Sigmoid
    """
    def __init__(self, channels: int):
        super().__init__()
        r = channels // 4
        self.conv = nn.Sequential(
            nn.Conv3d(channels, channels, 3, padding=1, bias=False),  # 0
            nn.ReLU(inplace=True),                                     # 1
            nn.Conv3d(channels, channels, 3, padding=1, bias=False),  # 2
        )
        self.se = nn.ModuleDict({
            "fc": nn.Sequential(
                nn.AdaptiveAvgPool3d(1),  # 0
                nn.Flatten(),             # 1
                nn.Linear(channels, r),  # 2
                nn.ReLU(inplace=True),   # 3
                nn.Linear(r, channels),  # 4
                nn.Sigmoid(),            # 5
            )
        })
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        h = self.conv(x)
        s = self.se["fc"](h).view(h.shape[0], h.shape[1], 1, 1, 1)
        return self.relu(x + h * s)


def _enc_block(in_ch: int, out_ch: int) -> nn.Sequential:
    """Strided conv downsample + SE-residual block."""
    return nn.Sequential(
        nn.Conv3d(in_ch, out_ch, 3, stride=2, padding=1, bias=False),  # 0
        nn.ReLU(inplace=True),                                           # 1
        nn.Identity(),                                                   # 2  placeholder
        SEResBlock3d(out_ch),                                            # 3
    )


class LUNAUNet(nn.Module):
    """
    3D U-Net with SE-residual blocks for pulmonary nodule segmentation.
    Input:  (B, 1, D, H, W)  — normalised HU volume, any D≥8, H=W=128 recommended
    Output: (B, 1, D, H, W)  — nodule probability map (raw logits)

    State dict key mapping:
      enc1.0  : Conv3d(1→32, 3, stride=2)   enc1.3  : SEResBlock3d(32)
      enc2.0  : Conv3d(32→64, 3, stride=2)  enc2.3  : SEResBlock3d(64)
      enc3.0  : Conv3d(64→128, 3, stride=2) enc3.3  : SEResBlock3d(128)
      bot.0   : Conv3d(128→256, 3, stride=2) + BN + ReLU
      bot.3/4 : 2× SEResBlock3d(256)
      up3     : ConvTranspose3d(256→128, 2, stride=2)
      dec3.0/1: 2× SEResBlock3d(256)   (cat: 128 up + 128 skip = 256 in)
      up2     : ConvTranspose3d(256→64, 2, stride=2)
      dec2.0/1: 2× SEResBlock3d(128)   (cat: 64 up + 64 skip = 128 in)
      up1     : ConvTranspose3d(128→32, 2, stride=2)
      dec1.0/1: 2× SEResBlock3d(64)    (cat: 32 up + 32 skip = 64 in)
      head    : Conv3d(64→1, 1)
      ds_head3: Conv3d(256→1, 1)   deep supervision
      ds_head2: Conv3d(128→1, 1)   deep supervision
    """
    def __init__(self):
        super().__init__()
        # Encoder
        self.enc1 = _enc_block(1,   32)
        self.enc2 = _enc_block(32,  64)
        self.enc3 = _enc_block(64,  128)
        # Bottleneck
        self.bot = nn.Sequential(
            nn.Conv3d(128, 256, 3, stride=2, padding=1, bias=False),  # 0
            nn.BatchNorm3d(256),                                        # 1  ← standalone BN
            nn.ReLU(inplace=True),                                      # 2
            SEResBlock3d(256),                                          # 3
            SEResBlock3d(256),                                          # 4
        )
        # Decoder
        self.up3  = nn.ConvTranspose3d(256, 128, 2, stride=2)
        self.dec3 = nn.Sequential(SEResBlock3d(256), SEResBlock3d(256))

        self.up2  = nn.ConvTranspose3d(256, 64, 2, stride=2)
        self.dec2 = nn.Sequential(SEResBlock3d(128), SEResBlock3d(128))

        self.up1  = nn.ConvTranspose3d(128, 32, 2, stride=2)
        self.dec1 = nn.Sequential(SEResBlock3d(64), SEResBlock3d(64))

        # Heads
        self.head     = nn.Conv3d(64,  1, 1)
        self.ds_head3 = nn.Conv3d(256, 1, 1)   # deep supervision
        self.ds_head2 = nn.Conv3d(128, 1, 1)   # deep supervision

    def forward(self, x):
        e1 = self.enc1(x)                               # (B,32, D/2,  H/2,  W/2)
        e2 = self.enc2(e1)                              # (B,64, D/4,  H/4,  W/4)
        e3 = self.enc3(e2)                              # (B,128,D/8,  H/8,  W/8)
        b  = self.bot(e3)                               # (B,256,D/16, H/16, W/16)

        d3 = self.dec3(torch.cat([self.up3(b),  e3], dim=1))  # (B,256,D/8,...)
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))  # (B,128,D/4,...)
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))  # (B,64, D/2,...)

        return self.head(d1)                            # (B,1,D/2,H/2,W/2) logits


class NoduleClassifier(nn.Module):
    """
    Classifies extracted nodule feature vectors as benign or malignant.
    Input:  (B, 192)  — nodule feature vector pooled from U-Net encoder
    Output: (B, 2)    — logits [benign, malignant]

    block1: Linear(192→256) + LayerNorm(256) + SiLU + Dropout
    block2: Linear(256→256) + LayerNorm(256) + SiLU + Dropout
    block3: Linear(256→128) + LayerNorm(128)
    skip:   Linear(192→128)
    head:   Linear(128→2)
    """
    def __init__(self):
        super().__init__()
        self.block1 = nn.Sequential(
            nn.Linear(192, 256), nn.LayerNorm(256), nn.SiLU(), nn.Dropout(0.3))
        self.block2 = nn.Sequential(
            nn.Linear(256, 256), nn.LayerNorm(256), nn.SiLU(), nn.Dropout(0.3))
        self.block3 = nn.Sequential(
            nn.Linear(256, 128), nn.LayerNorm(128))
        self.skip   = nn.Linear(192, 128)
        self.head   = nn.Linear(128, 2)

    def forward(self, x):                               # x: (B, 192)
        h = self.block1(x)
        h = self.block2(h)
        h = self.block3(h) + self.skip(x)              # residual
        return self.head(h)                             # (B, 2)


class NoduleLSTM(nn.Module):
    """
    Projects nodule feature trajectory forward in time.
    Input:  (B, T, 192)  sequence of nodule feature vectors
    Output: next_feat (B, 192), severity (B,)

    lstm:  3-layer LSTM, input=192, hidden=256
    attn:  MultiheadAttention(256, n_heads) — in_proj_weight (768,256) → n_heads divides 256
    proj:  Linear(256→256) → SiLU → Linear(256→192)   (outputs back to 192-d)
    sev:   Linear(256→64) → SiLU → Linear(64→1)
    """
    def __init__(self, n_heads: int = 4):
        super().__init__()
        self.lstm = nn.LSTM(192, 256, num_layers=3, batch_first=True, dropout=0.2)
        self.attn = nn.MultiheadAttention(256, num_heads=n_heads, batch_first=True)
        self.norm = nn.LayerNorm(256)
        self.proj = nn.Sequential(
            nn.Linear(256, 256), nn.SiLU(), nn.Linear(256, 192))
        self.sev  = nn.Sequential(
            nn.Linear(256, 64), nn.SiLU(), nn.Linear(64, 1))

    def forward(self, x):                               # x: (B, T, 192)
        out, _ = self.lstm(x)
        attn_out, _ = self.attn(out, out, out)
        ctx = self.norm(attn_out[:, -1])                # last step
        return self.proj(ctx), self.sev(ctx).squeeze(-1)
    

# ─── OSIC Pulmonary Fibrosis Digital Twin ────────────────────────────────────
# Exact architecture from digital_twin_osic.pt state dict:
#   img_enc.backbone  : EfficientNet-B0 (timm), conv_head→1280
#   img_enc.proj      : Linear(1280→256) + LayerNorm(256)
#   meta_enc.net      : Linear(5→128)+LN+SiLU+Dropout+Linear(128→64)+LN
#   fusion            : Linear(320→320) + LayerNorm(320)
#   temporal.lstm     : 2-layer LSTM, input=320, hidden=256
#   temporal.attn     : Linear(256→64)+Tanh+Linear(64→1)  [additive attention]
#   temporal.norm     : LayerNorm(256)
#   stage_head        : Linear(256→128)+SiLU+Dropout+Linear(128→3)
#   fvc_head          : Linear(256→64)+SiLU+Dropout+Linear(64→1)
#   risk_head         : Linear(256→64)+SiLU+Dropout+Linear(64→1)
#   conf_head         : Linear(256→32)+SiLU+Linear(32→1)

class OSICMetaEncoder(nn.Module):
    """
    Encodes 5 clinical metadata scalars to a 64-d vector.
    Expected input features (in order):
      [age, sex_encoded, smoking_encoded, baseline_fvc_norm, weeks_norm]
    net.0 : Linear(5→128)    net.1 : LayerNorm(128)
    net.4 : Linear(128→64)   net.5 : LayerNorm(64)
    (indices 2,3 are SiLU + Dropout — not in state dict as they have no params)
    """
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(5, 128),      # 0
            nn.LayerNorm(128),      # 1
            nn.SiLU(),              # 2
            nn.Dropout(0.1),        # 3
            nn.Linear(128, 64),     # 4
            nn.LayerNorm(64),       # 5
        )

    def forward(self, x):           # x: (B, 5)
        return self.net(x)          # (B, 64)


class OSICTemporalHead(nn.Module):
    """
    2-layer LSTM + additive attention.
    lstm  : input=320 (fused), hidden=256, 2 layers
    attn  : Linear(256→64) + Tanh + Linear(64→1)
    norm  : LayerNorm(256)
    """
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(320, 256, num_layers=2, batch_first=True, dropout=0.2)
        self.attn = nn.Sequential(
            nn.Linear(256, 64),     # 0
            nn.Tanh(),              # 1
            nn.Linear(64, 1),       # 2
        )
        self.norm = nn.LayerNorm(256)

    def forward(self, x):           # x: (B, T, 320)
        out, _ = self.lstm(x)
        w = torch.softmax(self.attn(out), dim=1)
        return self.norm((w * out).sum(dim=1))  # (B, 256)


class OSICFibrosisTwin(nn.Module):
    """
    OSIC Pulmonary Fibrosis Digital Twin.
    Single self-contained model — no external LSTM or scaler files needed.

    Heads:
      stage_head : 3-class (mild=0 / moderate=1 / severe=2)
      fvc_head   : FVC regression (raw logit, scaled in inference)
      risk_head  : risk score [0,1] after sigmoid
      conf_head  : confidence [0,1] after sigmoid
    """
    STAGE_LABELS = ["Mild", "Moderate", "Severe"]

    def __init__(self):
        super().__init__()
        # Image encoder — EfficientNet-B0 via timm
        bb = timm.create_model("efficientnet_b0", pretrained=False, in_chans=3)
        bb.classifier = nn.Identity()
        self.img_enc = nn.ModuleDict({
            "backbone": bb,
            "proj": nn.Sequential(
                nn.Linear(1280, 256),
                nn.LayerNorm(256),
            ),
        })

        self.meta_enc = OSICMetaEncoder()

        # fusion: img(256) + meta(64) = 320 → 320
        self.fusion = nn.Sequential(
            nn.Linear(320, 320),
            nn.LayerNorm(320),
        )

        self.temporal = OSICTemporalHead()

        # stage_head: Linear(256→128)+SiLU+Dropout+Linear(128→3)
        self.stage_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 3),
        )
        # fvc_head: Linear(256→64)+SiLU+Dropout+Linear(64→1)
        self.fvc_head = nn.Sequential(
            nn.Linear(256, 64),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )
        # risk_head: same shape as fvc_head
        self.risk_head = nn.Sequential(
            nn.Linear(256, 64),
            nn.SiLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
        )
        # conf_head: Linear(256→32)+SiLU+Linear(32→1)
        self.conf_head = nn.Sequential(
            nn.Linear(256, 32),
            nn.SiLU(),
            nn.Linear(32, 1),
        )

    def forward(self, imgs, meta, seq_len: int = 6):
        # imgs: (B, 3, 224, 224)   meta: (B, 5)
        img_feat  = self.img_enc["proj"](self.img_enc["backbone"](imgs))   # (B, 256)
        meta_feat = self.meta_enc(meta)                                     # (B,  64)
        fused     = self.fusion(torch.cat([img_feat, meta_feat], dim=-1))  # (B, 320)

        seq = fused.unsqueeze(1).expand(-1, seq_len, -1)   # (B, T, 320)
        ctx = self.temporal(seq)                            # (B, 256)

        stage = self.stage_head(ctx)                        # (B, 3) logits
        fvc   = self.fvc_head(ctx).squeeze(-1)              # (B,)
        risk  = torch.sigmoid(self.risk_head(ctx)).squeeze(-1)
        conf  = torch.sigmoid(self.conf_head(ctx)).squeeze(-1)
        return stage, fvc, risk, conf, fused