# θ.1b top-star pixel-size audit

Canonical view: 1080 × 1.5 DPR viewport (backbuffer 1620px), 60° FOV.
Pipeline: HYG apparent-mag → abs-mag (distance modulus) → pseudo-size (0.15·√10^(-0.4·absMag) pc) → ×DISTANCE_SCALE (206265000) → ×STAR_SIZE_FACTOR (0.00000131526) → solidAngle = a_size / dist → clamp [minQuad=1.600e-9, 3e-8] → billboard width = clampedSA × dist × u_sizeFactor (1200000) → projected pixels = clampedSA × u_sizeFactor × pixelsPerRad (1403.0).

## Top 15 by HYG apparent magnitude (rank 1 = brightest)

| Rank | Name            |   HIP | Con | apparentMag |   B-V | dist (pc) | absMag | pseudoSize (pc) | raw SA (rad) | clamped SA (rad) | opacity | pixels | Clamped? |
| ---: | :-------------- | ----: | :-- | ----------: | ----: | --------: | -----: | --------------: | -----------: | ---------------: | ------: | -----: | :------: |
|    1 | Sirius          | 32349 | CMa |       -1.40 |  0.01 |      2.64 |   1.49 |          0.0754 |     3.759e-8 |         3.000e-8 |   1.000 |   50.5 |    ✓     |
|    2 | Canopus         | 30438 | Car |       -0.60 |  0.16 |     94.79 |  -5.48 |          1.8743 |     2.601e-8 |         2.601e-8 |   1.000 |   43.8 |          |
|    3 | Arcturus        | 69673 | Boo |        0.00 |  1.24 |     11.26 |  -0.26 |          0.1689 |     1.973e-8 |         1.973e-8 |   1.000 |   33.2 |          |
|    4 | Rigil Kentaurus | 71683 | Cen |        0.00 |  0.71 |      1.32 |   4.39 |          0.0199 |     1.973e-8 |         1.973e-8 |   1.000 |   33.2 |          |
|    5 | Vega            | 91262 | Lyr |        0.00 |  0.00 |      7.68 |   0.57 |          0.1152 |     1.973e-8 |         1.973e-8 |   1.000 |   33.2 |          |
|    6 | Capella         | 24608 | Aur |        0.10 |  0.80 |     13.12 |  -0.49 |          0.1880 |     1.884e-8 |         1.884e-8 |   1.000 |   31.7 |          |
|    7 | Rigel           | 24436 | Ori |        0.20 | -0.03 |    264.55 |  -6.91 |          3.6191 |     1.799e-8 |         1.799e-8 |   1.000 |   30.3 |          |
|    8 | Procyon         | 37279 | CMi |        0.40 |  0.43 |      3.51 |   2.67 |          0.0438 |     1.641e-8 |         1.641e-8 |   1.000 |   27.6 |          |
|    9 | Achernar        |  7588 | Eri |        0.50 | -0.16 |     42.75 |  -2.65 |          0.5094 |     1.567e-8 |         1.567e-8 |   1.000 |   26.4 |          |
|   10 | Betelgeuse      | 27989 | Ori |        0.50 |  1.50 |    152.67 |  -5.42 |          1.8191 |     1.567e-8 |         1.567e-8 |   1.000 |   26.4 |          |
|   11 | Hadar           | 68702 | Cen |        0.60 | -0.23 |    120.19 |  -4.80 |          1.3676 |     1.497e-8 |         1.497e-8 |   1.000 |   25.2 |          |
|   12 | Altair          | 97649 | Aql |        0.80 |  0.22 |      5.13 |   2.25 |          0.0532 |     1.365e-8 |         1.365e-8 |   1.000 |   23.0 |          |
|   13 | Acrux           | 60718 | Cru |        0.80 | -0.24 |     98.72 |  -4.17 |          1.0244 |     1.365e-8 |         1.365e-8 |   1.000 |   23.0 |          |
|   14 | Aldebaran       | 21421 | Tau |        0.90 |  1.54 |     20.43 |  -0.65 |          0.2025 |     1.303e-8 |         1.303e-8 |   1.000 |   21.9 |          |
|   15 | (idx 14)        |     — | —   |        1.00 |  0.65 |     12.94 |   0.44 |          0.1225 |     1.245e-8 |         1.245e-8 |   1.000 |   21.0 |          |

## Same 15 re-sorted by FINAL pixel size (largest first)

| Rank (by px) | Name            | apparentMag | distPc | absMag | pseudoSize (pc) | raw SA (rad) | pixels | Clamped? |
| -----------: | :-------------- | ----------: | -----: | -----: | --------------: | -----------: | -----: | :------: |
|            1 | Sirius          |       -1.40 |   2.64 |   1.49 |          0.0754 |     3.759e-8 |   50.5 |    ✓     |
|            2 | Canopus         |       -0.60 |  94.79 |  -5.48 |          1.8743 |     2.601e-8 |   43.8 |          |
|            3 | Arcturus        |        0.00 |  11.26 |  -0.26 |          0.1689 |     1.973e-8 |   33.2 |          |
|            4 | Rigil Kentaurus |        0.00 |   1.32 |   4.39 |          0.0199 |     1.973e-8 |   33.2 |          |
|            5 | Vega            |        0.00 |   7.68 |   0.57 |          0.1152 |     1.973e-8 |   33.2 |          |
|            6 | Capella         |        0.10 |  13.12 |  -0.49 |          0.1880 |     1.884e-8 |   31.7 |          |
|            7 | Rigel           |        0.20 | 264.55 |  -6.91 |          3.6191 |     1.799e-8 |   30.3 |          |
|            8 | Procyon         |        0.40 |   3.51 |   2.67 |          0.0438 |     1.641e-8 |   27.6 |          |
|            9 | Betelgeuse      |        0.50 | 152.67 |  -5.42 |          1.8191 |     1.567e-8 |   26.4 |          |
|           10 | Achernar        |        0.50 |  42.75 |  -2.65 |          0.5094 |     1.567e-8 |   26.4 |          |
|           11 | Hadar           |        0.60 | 120.19 |  -4.80 |          1.3676 |     1.497e-8 |   25.2 |          |
|           12 | Altair          |        0.80 |   5.13 |   2.25 |          0.0532 |     1.365e-8 |   23.0 |          |
|           13 | Acrux           |        0.80 |  98.72 |  -4.17 |          1.0244 |     1.365e-8 |   23.0 |          |
|           14 | Aldebaran       |        0.90 |  20.43 |  -0.65 |          0.2025 |     1.303e-8 |   21.9 |          |
|           15 | (idx 14)        |        1.00 |  12.94 |   0.44 |          0.1225 |     1.245e-8 |   21.0 |          |

## Diagnostics

- Of the top-15 brightest (apparent mag), **1 saturate the 3e-8 solidAngle clamp**. Any stars that share this ceiling have identical billboard width; differences then come from color / bloom / selective-HDR gain.
- 14 are below the clamp ceiling and render at sub-ceiling pixel sizes:
  - Canopus: 43.8 px (raw SA 2.60e-8 vs ceiling 3.00e-8)
  - Arcturus: 33.2 px (raw SA 1.97e-8 vs ceiling 3.00e-8)
  - Rigil Kentaurus: 33.2 px (raw SA 1.97e-8 vs ceiling 3.00e-8)
  - Vega: 33.2 px (raw SA 1.97e-8 vs ceiling 3.00e-8)
  - Capella: 31.7 px (raw SA 1.88e-8 vs ceiling 3.00e-8)
  - Rigel: 30.3 px (raw SA 1.80e-8 vs ceiling 3.00e-8)
  - Procyon: 27.6 px (raw SA 1.64e-8 vs ceiling 3.00e-8)
  - Achernar: 26.4 px (raw SA 1.57e-8 vs ceiling 3.00e-8)
  - Betelgeuse: 26.4 px (raw SA 1.57e-8 vs ceiling 3.00e-8)
  - Hadar: 25.2 px (raw SA 1.50e-8 vs ceiling 3.00e-8)
  - Altair: 23.0 px (raw SA 1.36e-8 vs ceiling 3.00e-8)
  - Acrux: 23.0 px (raw SA 1.36e-8 vs ceiling 3.00e-8)
  - Aldebaran: 21.9 px (raw SA 1.30e-8 vs ceiling 3.00e-8)
  - (idx 14): 21.0 px (raw SA 1.24e-8 vs ceiling 3.00e-8)
