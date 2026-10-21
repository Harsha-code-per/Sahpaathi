"""SYNTHETIC data, only to prove the training pipeline and the server's use of its output work.

These numbers are invented by a simple rule (a lowered brow, squinting and a missed question go with
"confused"). A model trained on them learns that rule back and nothing about real people. Never ship
weights trained on this file. Real data comes from learners' own labelled sessions.

    python ml/make_synthetic.py -o ml/synthetic.csv
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# The columns the server reports (backend/app/tutor/sense/graph.py: FEATURES).
FEATURES = (
    "brow_down brow_inner_up eye_squint mouth_frown mouth_press eye_closure jaw_open gaze_away "
    "head_down slouch hand_to_face lean_back noise face_missing misses latency_s fillers silence_s"
).split()


def make(n: int, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    confused = rng.random(n) < 0.4
    cols = {f: np.clip(rng.normal(0.04, 0.04, n), 0, 1) for f in FEATURES}
    cols["brow_down"] = np.clip(rng.normal(np.where(confused, 0.30, 0.05), 0.08), 0, 1)
    cols["eye_squint"] = np.clip(rng.normal(np.where(confused, 0.22, 0.04), 0.08), 0, 1)
    cols["hand_to_face"] = np.clip(rng.normal(np.where(confused, 0.30, 0.08), 0.15), 0, 1)
    cols["misses"] = np.where(confused, rng.integers(0, 3, n), rng.integers(0, 1, n)).astype(float)
    cols["latency_s"] = np.clip(rng.normal(np.where(confused, 9, 3), 3), 0, 60)
    cols["face_missing"] = rng.random(n) * 0.2
    cols["fillers"] = rng.poisson(np.where(confused, 1.5, 0.3)).astype(float)
    cols["silence_s"] = rng.random(n) * 10
    frame = pd.DataFrame(cols)[FEATURES].round(4)
    frame["label"] = np.where(confused, "confused", "got_it")
    frame.insert(0, "session", [f"synthetic-{i % 12}" for i in range(n)])  # 12 invented sittings
    return frame


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-n", type=int, default=400)
    ap.add_argument("-o", "--out", type=Path, default=Path("synthetic.csv"))
    args = ap.parse_args()
    make(args.n).to_csv(args.out, index=False)
    print(f"Wrote {args.n} SYNTHETIC rows to {args.out}. Do not train production weights on this.")
