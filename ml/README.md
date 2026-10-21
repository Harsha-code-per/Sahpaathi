# ml: training the perception model

Turns learners' own labelled moments into `weights.json` for the AI teacher's perception agents.
The whole story (what is collected, privacy, limits) is in [docs/SENSE.md](../docs/SENSE.md).

```bash
pip install -r ml/requirements.txt
python ml/train_sense.py my-sense-session.csv -o backend/app/tutor/sense/weights.json
```

Or in Google Colab: open `train_sense.ipynb`, upload `train_sense.py` and your CSVs, run all, download `weights.json`.

- `train_sense.py` logistic regression; refuses under 60 rows or under 20 of a label; reports cross-validated AUC.
- `make_synthetic.py` **invented** data to prove the pipeline. Never train production weights on it.
- CSV columns: the numbers the server reports (`backend/app/tutor/sense/graph.py` `FEATURES`) plus `label` (`got_it` or `confused`).
