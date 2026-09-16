"""
Attention-Augmented LSTM for Orbit Residual Error Prediction
Learns time-dependent systematic drifts and periodic oscillations of SGP4 errors in RIC frame.
"""

import torch
import torch.nn as nn


class TemporalAttention(nn.Module):
    """
    Self-attention layer over LSTM hidden states sequence to weight critical orbital epochs.
    """

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.query_proj = nn.Linear(hidden_dim, hidden_dim)
        self.key_proj = nn.Linear(hidden_dim, hidden_dim)
        self.scale = 1.0 / (hidden_dim**0.5)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: [batch, seq_len, hidden_dim]
        q = self.query_proj(x)
        k = self.key_proj(x)
        scores = torch.bmm(q, k.transpose(1, 2)) * self.scale
        attn_weights = torch.softmax(scores, dim=-1)
        context = torch.bmm(attn_weights, x)
        # Pool across sequence dimension
        return torch.mean(context, dim=1)


class ResidualLSTM(nn.Module):
    """
    Bi-directional / stacked LSTM with temporal attention for SGP4 residual error correction.
    """

    def __init__(
        self,
        input_dim: int = 10,
        hidden_dim: int = 64,
        num_layers: int = 2,
        output_dim: int = 6,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=False,
        )
        self.attention = TemporalAttention(hidden_dim)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [batch, seq_len, input_dim]
        h0 = self.input_proj(x)
        lstm_out, _ = self.lstm(h0)
        attended = self.attention(lstm_out)
        out = self.head(attended)
        return out
