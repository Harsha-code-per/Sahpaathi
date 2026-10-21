"""Train the perception model from labelled sessions, and write `weights.json` for the server.

Input: one or more CSVs downloaded from the AI teacher ("download my labelled moments"). Each row is one
window of the learner's own numbers (the columns the server reports) plus a label the learner chose:
`got_it` or `confused`. Nothing here ever sees a picture or a sound.

    python ml/train_sense.py my-sense-session.csv more.csv -o backend/app/tutor/sense/weights.json

The model is a plain logistic regression, on purpose: it has a handful of weights that a person can
read ("brow_down: +9.8"), it is fast on a free server, and it is hard to overfit on a few hundred rows.
The scaling is folded into the weights, so the server can apply them to raw numbers.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupKFold, StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

POSITIVE, NEGATIVE = "confused", "got_it"
MIN_ROWS, MIN_PER_CLASS = 60, 20


def load(paths: list[Path]) -> tuple[pd.DataFrame, pd.Series, pd.Series | None]:
    """Features, labels and (if the CSVs have it) the sitting each row came from. A sitting is one
    person at one time, so testing on unseen sittings is the honest test of "works on new people"."""
    frames = []
    for i, p in enumerate(paths):
        f = pd.read_csv(p)
        if "session" in f:
            f["session"] = f"{i}:" + f["session"].astype(str)
        frames.append(f)
    frame = pd.concat(frames, ignore_index=True)
    frame = frame[frame["label"].isin([POSITIVE, NEGATIVE])]
    groups = frame["session"] if "session" in frame else None
    return frame.drop(columns=[c for c in ("label", "session") if c in frame]), (frame["label"] == POSITIVE).astype(int), groups


def train(x: pd.DataFrame, y: pd.Series, groups: pd.Series | None = None) -> dict:
    counts = y.value_counts().to_dict()
    if len(y) < MIN_ROWS or min(counts.get(0, 0), counts.get(1, 0)) < MIN_PER_CLASS:
        sys.exit(f"Need at least {MIN_ROWS} rows with {MIN_PER_CLASS}+ of each label; got {counts}.")
    # Constant columns carry no information and would only add noise.
    cols = [c for c in x.columns if x[c].nunique() > 1]
    model = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, class_weight="balanced", max_iter=1000))
    if groups is not None and groups.nunique() >= 5:
        folds = GroupKFold(n_splits=min(5, groups.nunique()))  # whole sittings are held out together
        prob = cross_val_predict(model, x[cols], y, cv=folds, groups=groups, method="predict_proba")[:, 1]
        how = f"held-out sittings ({groups.nunique()} sittings)"
    else:
        folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
        prob = cross_val_predict(model, x[cols], y, cv=folds, method="predict_proba")[:, 1]
        how = "random rows (no `session` column or under 5 sittings: this flatters the score)"
    metrics = {"auc": round(float(roc_auc_score(y, prob)), 3), "accuracy": round(float(accuracy_score(y, prob > 0.5)), 3), "rows": int(len(y)), "confused_rows": int(y.sum()), "validation": how}
    model.fit(x[cols], y)
    scaler, lr = model.named_steps["standardscaler"], model.named_steps["logisticregression"]
    # Fold the scaling into the weights: z = b + sum(c_i * (x_i - mean_i) / scale_i)  ==  b' + sum(c'_i * x_i)
    coef = lr.coef_[0] / scaler.scale_
    bias = float(lr.intercept_[0] - np.sum(coef * scaler.mean_))
    return {
        "note": "Trained on the learners' own labelled sessions. Replaces the hand-set 'confused' rule.",
        "features": cols,
        "metrics": metrics,
        "models": {"confused": {"bias": round(bias, 5), "coef": {c: round(float(w), 5) for c, w in zip(cols, coef)}}},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="+", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("weights.json"))
    args = ap.parse_args()
    x, y, groups = load(args.csv)
    result = train(x, y, groups)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    m = result["metrics"]
    print(f"Wrote {args.out}: AUC {m['auc']}, accuracy {m['accuracy']} on {m['rows']} rows ({m['confused_rows']} confused), validated on {m['validation']}.")
    if m["auc"] < 0.7:
        print("AUC is low: the model barely beats guessing. Collect more labelled moments before using these weights.")


if __name__ == "__main__":
    main()
