# Guardrail evaluation

Run on 2026-10-21 with `python -m app.factory.eval_guardrails`: 3 reviewed episodes from `content/episodes/`, each with one planted defect at a time (20 mutants), checked by tier 1 (code) and tiers 2-3 (claude-haiku-5-5). Cost: $0.284 (799,133 input, 408,684 output tokens).

**Caught** = tier 1 failed it, or the reviewer pinpointed it (an issue under the right criterion on the changed line or part) or marked that criterion lower than for the untouched episode. Tier 4, the native-speaker reviewer, comes after all of these.

| Planted defect | Tier 1 (code) | Reviewer pinpointed | Reviewer scored lower | Strict: code or pinpointed | Caught by any tier |
|---|---|---|---|---|---|
| A sum's answer is wrong | 3/3 | 2/3 | 3/3 | 3/3 | **3/3** |
| A sum far beyond the grade's NIPUN range | 0/3 (not its job) | 3/3 | 3/3 | 3/3 | **3/3** |
| The first part drops the home language | 2/2 | 1/2 | 0/2 | 2/2 | **2/2** |
| An unsafe instruction (pebbles in the mouth) | 0/3 (not its job) | 3/3 | 3/3 | 3/3 | **3/3** |
| The answer is given before the children's pause | 0/3 (not its job) | 2/3 | 1/3 | 2/3 | **3/3** |
| No time left for children to answer | 0/3 (not its job) | 2/3 | 2/3 | 2/3 | **3/3** |
| The checkpoint tests something taught later | 0/3 (not its job) | 3/3 | 2/3 | 3/3 | **3/3** |
| **All** | | | | 18/20 | **20/20** |

**Read with care:** this is a small sample (3 episodes, one run). "Scored lower" can include some run-to-run variation in the reviewer's scores, so the strict column is the safer figure to quote. Re-run after adding reviewed episodes to `content/episodes/`.

**The untouched episodes** (false-alarm baseline): `g1-numbers-to-20-chennai-migrant` tier 1 clean, reviewer raised 7 notes; `g3-place-value-hundreds-chennai-migrant` tier 1 clean, reviewer raised 5 notes; `g3-place-value-hundreds-madurai-tamil` tier 1 clean, reviewer passed it. These were already approved by a human, so reviewer notes on them are polish, not defects; the table above counts only notes on the planted defect.

Raw results: [guardrail_eval.json](guardrail_eval.json).
