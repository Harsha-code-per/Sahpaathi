# Master prompt for Gemini in Google Colab

Open a **new Colab notebook** (Runtime: CPU is enough), click the **Gemini** sparkle, and paste the
whole block below as one message. It asks Gemini to write every cell. Run the cells in order and read
each output before moving on.

Before you start:
- Put `train_sense.py` (from this folder) and your session CSV(s) ready to upload. The CSVs hold **numbers only**, no pictures or sound.
- If you want the optional Hugging Face part, add your token in Colab **Secrets** (the key icon) as `HF_TOKEN` and switch on "Notebook access". **Never paste the token into a cell or a chat.**
- There is no public dataset for this. Do not train on invented data except to test the notebook (`make_synthetic.py`); weights from invented data must never be used.

---

```text
You are an expert machine-learning engineer helping me build ONE Google Colab notebook. Write the notebook
as a sequence of clearly separated cells: for each cell, give a short markdown heading line, then a single
code block I can paste. Keep the code simple, commented, and runnable top to bottom on a free CPU runtime.
After the last cell, give a short checklist of what to look at in the outputs. Do not skip steps and do not
invent results: every number I see must come from running the code.

PROJECT
Sahpaathi is an AI teacher for children in India. With the learner's opt-in, the learner's own device turns
the camera and microphone into a few small numbers (never pictures or sound). Those numbers are sent every
4 seconds, summarised over a 15-second window, and a server decides whether the teacher should gently ask
"is everything okay?" (the learner may look confused). I need a small, honest, explainable model that predicts
"confused" from those numbers, trained on labelled moments the learners chose to save.

PRIVACY RULES (hard constraints)
- This notebook only ever sees the numeric CSV. Never ask for, load, or generate images, video or audio of people.
- Never print, log, store in a variable that is displayed, or write to a file any API token. Read Hugging Face
  tokens only with `from google.colab import userdata; userdata.get('HF_TOKEN')`, and only if that part is run.
- The last cell must delete every uploaded CSV and intermediate file from the runtime, and tell me to download
  weights.json first. Do not copy data to Google Drive.
- Do not try to identify any person. The `session` column is a random id for one sitting, nothing more.

INPUT: one or more CSV files that I upload with `files.upload()`
Columns (exactly these names): session, brow_down, brow_inner_up, eye_squint, mouth_frown, mouth_press,
eye_closure, jaw_open, gaze_away, head_down, slouch, hand_to_face, lean_back, noise, face_missing, misses,
latency_s, fillers, silence_s, label
- Every feature is a number (most are between 0 and 1; misses is 0-3; latency_s and silence_s are seconds;
  fillers is a count).
- label is the text "confused" or "got_it". Ignore any other label value.
- session is a random text id; several rows share one session. A session is one person at one time.
- A file named like `synthetic*.csv` is invented test data: use it only if I say "test run", and then print
  a large warning that the resulting weights must not be used.

CELLS TO WRITE
1. Install and import: pandas, numpy, scikit-learn, matplotlib. Print library versions.
2. Upload and load: `files.upload()`, concatenate all CSVs, prefix each file's session ids with the file index so
   they cannot collide. Validate the schema: check every required column exists, features are numeric, no NaN
   (drop rows with NaN and say how many), keep only the two labels. Print: rows, confused rows, got_it rows,
   number of distinct sessions, and rows per session (min, median, max). Stop with a clear message if there are
   fewer than 60 rows, fewer than 20 of either label, or fewer than 5 sessions.
3. Look at the data: a table of each feature's mean for confused vs got_it, and a bar chart of the
   standardised difference. Warn about any feature that is constant, and any feature whose values look
   unlike the description above (for example outside 0-1 where 0-1 is expected).
4. Honest validation: use GroupKFold with groups = session (up to 5 folds), so every fold is tested on sittings
   the model has not seen. Compare three models with the same folds: (a) a baseline that always predicts the
   majority class, (b) LogisticRegression(C=0.5, class_weight='balanced', max_iter=1000) after StandardScaler,
   (c) a shallow gradient-boosted or random-forest model with max_depth<=3 for comparison only. Report ROC-AUC,
   PR-AUC, and accuracy for each, with the spread across folds. Use (b) as the model to ship unless (c) is
   clearly better by more than 0.05 AUC; if so, say so but still ship (b) because it must be readable.
5. Calibration and the alert threshold: plot a calibration curve for (b) on the held-out predictions. Apply
   Platt (sigmoid) calibration if it helps. Then choose the probability threshold at which the teacher should
   ask "is everything okay?". The cost of a wrong alert is small (one extra gentle question) but too many alerts
   annoy the learner, so choose the threshold that gives at least 70% precision, and report the recall at that
   threshold and how many alerts per 100 windows that means. Show the precision-recall curve. The threshold must
   lie between 0.40 and 0.90 (a server enforces this); if 70% precision cannot be reached inside that range, or
   the held-out AUC is above 0.98 (suspiciously perfect: the data may be invented or leaking), say so in a large
   warning and DO NOT write weights.json.
6. Fairness and robustness checks (only with the numbers available): AUC per session (min, median, max), and
   a table of how the score changes if `face_missing` > 0.5 (face often out of view). Print a plain sentence on
   what the results do and do not show. Never claim the model works for any group of people.
7. Final training and export: fit the chosen pipeline on ALL rows. Fold the StandardScaler into the weights so
   they apply to raw numbers: coef_raw = coef / scale, bias_raw = intercept - sum(coef_raw * mean). Write
   `weights.json` in EXACTLY this shape (keys and nesting must match, because a server reads it):
     {
       "note": "Trained on the learners' own labelled sessions. Replaces the hand-set 'confused' rule.",
       "features": [list of feature names used, in order],
       "metrics": {"auc": float, "accuracy": float, "rows": int, "confused_rows": int,
                   "validation": "held-out sittings (N sittings)"},
       "threshold": float,
       "models": {"confused": {"bias": float, "coef": {"<feature name>": float, ...}}}
     }
   Round weights to 5 decimals. Use only the features that vary. Then verify the export: reload weights.json,
   recompute the probability for 5 random rows with plain numpy (sigmoid(bias + sum(coef * x))), and assert it
   matches the sklearn pipeline's predict_proba within 1e-6. Print "EXPORT VERIFIED" only if the assert passes.
8. Read the model (this is the sanity check): print the top 8 weights by absolute size with a one-line plain-English meaning each (for
   example "brow_down: a lowered brow raises the chance of confused"), and flag any weight whose sign looks
   backwards (for example closed eyes, slouching or looking away LOWERING the chance of confused, or a larger
   eye_squint lowering it) as a reason NOT to ship the file, and print a clear "DO NOT USE" line if more than two
   weights look backwards.
9. Download and clean up: `files.download('weights.json')`, then delete every uploaded CSV and any other file
   we created except weights.json, and print what was deleted.
10. OPTIONAL, run only if I add HF_TOKEN in Secrets and say "run the audio part": evaluate (do NOT train)
   a pretrained audio-event classifier from Hugging Face (for example `MIT/ast-finetuned-audioset-10-10-0.4593`
   with `transformers.pipeline('audio-classification')`) on a few public sound clips of classroom-type noise
   (a fan, traffic, a TV, speech, silence) that I upload myself. Output a table of which predicted labels
   appear for each clip, and propose a JSON mapping from AudioSet label to one of "speech", "tv_or_music",
   "traffic", "household", "quiet" so an app could name the kind of noise. This is a check of the pretrained
   model only; nothing from this step is used to train on children's data. Never display the token.

STYLE
- Plain Python, no exotic libraries, short functions, fixed random seeds (0).
- Print clear messages in simple English; no jargon without a one-line explanation.
- If something in my data looks wrong, stop and tell me what to fix instead of guessing.
- Finish with: "What to check before using weights.json": AUC on held-out sittings must be at least 0.70,
  the weights must make sense (cell 8), and I must have at least several hundred labelled moments from many
  different people, rooms and lighting.
```

---

## After the notebook runs

1. Download `weights.json` (the notebook does this).
2. Put it at `backend/app/tutor/sense/weights.json` in a pull request. The server reads it on the next
   start and uses it in place of the hand-set "confused" rule. Everything else stays rule-based.
3. If the held-out AUC is below about 0.7, do **not** ship it: collect more labelled moments first.
