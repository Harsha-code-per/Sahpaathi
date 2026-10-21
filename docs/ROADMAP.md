# Future roadmap

Draft for the deck's Future Roadmap pages (10% of the Build score). Keep it concrete: who adopts it, how, and what it costs.

## Next 3 months: pilot to proof
- Pilot in 10–20 multigrade schools with one DIET / Block Resource Centre. Measure guided minutes per child, % "Most got it" after branching, and catch-up call completion.
- Grow from Grades 1–3 numeracy to literacy (phonics, oral reading fluency) aligned to NIPUN Bharat.
- Add languages: all 22 scheduled languages through Indic TTS; tribal languages (Santali, Gondi, Bhili, Kui…) through community phrase banks.

## Integration with existing systems
- **NIPUN Bharat / Samagra Shiksha:** episodes tagged by NIPUN learning-outcome codes; dashboards roll up to the block/district.
- **CRPs (cluster resource persons):** they already visit monthly. They carry packs on phones/SD cards and see the CRP dashboard.
- **DIKSHA:** publish approved episodes and chalk-sketch cards as open content.
- **State IVR / community radio:** the same packs play on existing state IVR lines and community radio slots.

## Online Mode (for connected students)
A 1-on-1 live AI tutor for older or connected learners, sharing the same curriculum. **A prototype exists** ([MODES.md](MODES.md), [STATUS.md](STATUS.md#2-online-mode-built-early-as-a-prototype-decision-needed)).
- **Built:** a spoken teacher that chats, then plans any topic, PDF or textbook photo into parts, teaches each, quizzes it, and teaches it again until it lands; answers doubts and switches language or "like I'm 5" on request; and takes breaks with riddles, quick maths and a memory game.
- **Built, untested on real faces:** opt-in, on-device sensing of confusion, tiredness, distraction and noise by four LangGraph agents and an orchestrator, which only makes the teacher *ask* if the learner is okay. **Raw video and audio never leave the device; nothing is recorded; saved moments are deleted on Stop or after 30 minutes** ([SENSE.md](SENSE.md)).
- **Next:** a real parental-consent flow (verifiable, under the DPDP Act 2023) and legal review before any child uses the camera; learner accounts with saved progress; the four lesson guardrails on the tutor's answers; real-data training of the perception model from consented pilots; an on-device sound classifier for the *kind* of noise; study tools such as video explainers and handwritten-style notes.

The Build-stage submission is the offline classroom. Online Mode extends Sahpaathi beyond the "no child devices" constraint, so it is labelled a prototype wherever it is shown.

## Hybrid (planned)
The two modes helping each other: a child at home continues the class's lesson with the AI teacher; the class's *Few got it* taps tell the AI what to revisit; the AI's results reach the CRP dashboard, with consent; and a smartphone family can catch an absent child up by AI instead of by phone call. Plan: [MODES.md](MODES.md#hybrid-planned-not-started).

## Offline upgrades
- Voice + pen-stroke micro-capsules (<100 KB) between teachers over 2G.
- Wi-Fi Direct study pods for village peer groups.
- Step-locked worked solutions; an anonymous "lost here" pulse.

## What it costs
Lessons are written once per language × grade × chapter and then shared by every classroom that needs them, so the content cost per classroom falls as Sahpaathi spreads. The variable costs are the speaker and the catch-up calls.

**Per lesson, once (about ₹205):** Claude writes it and Haiku reviews it, about $1 or ₹84 (measured: the 19 Oct batch cost $12 for 12 lessons, at ₹84 per US$). Sarvam Bulbul v3 voices it, about 7,000 characters at ₹30 per 10,000, so ₹21 (measured on the three voiced packs). A native-speaker reviewer spends about 20 minutes on it, about ₹100 at ₹300 an hour.

**One language, Grades 1–3, a full year:** 3 lessons a week × 36 weeks × 3 grades = 324 lessons, so about **₹66,000, once**, reused every following year.

**Per classroom per year:**

| Classrooms | Content share | Speaker (₹500 over 3 years) | Catch-up calls | Hosting | **Per classroom** | **Per child** (30) | Without calls |
|---|---|---|---|---|---|---|---|
| 10 (pilot, 1 language) | ₹6,640 | ₹167 | ₹2,592 | free tiers | **₹9,400** | **₹313** | ₹227 per child |
| 1,000 (a district, 1 language) | ₹66 | ₹167 | ₹2,592 | ~₹24 | **₹2,850** | **₹95** | ₹9 per child |
| 1,00,000 (10 languages) | ₹7 | ₹167 | ₹2,592 | ~₹10 | **₹2,780** | **₹93** | ₹6 per child |

**Catch-up calls are about 90% of the cost at scale:** 30 children × 20% absent × 108 lesson days = 648 calls a classroom a year, each about 4 minutes at about ₹1 a minute. Exotel does not publish per-minute rates; third-party figures are ₹0.50–1.50, so this line is the one to confirm with Exotel's rate card. Ways to bring it down: one weekly call per absent child instead of one per day missed, or playing the recaps on existing state IVR lines and community radio slots (see Integration above). The teacher's own phone and the content are almost free at scale; everything else is a few rupees per child per year.

Sources: [Sarvam API pricing](https://sarvam.ai/api-pricing) (Bulbul v3, beta), [Exotel's note that outbound calls bill two legs](https://docs.exotel.com/business-phone-system/why-am-i-charged-for-incoming-calls), third-party Exotel rate estimates ([Edesy](https://edesy.in/ai-voice-agent/providers/exotel)). Our own measurements: the 19 Oct batch cost and the voiced packs (docs/TESTING_LOG.md, V1–V3).
