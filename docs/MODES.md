# Two modes: Offline classroom and Online AI teacher

Sahpaathi serves two situations that need opposite things from the network, so it has two modes that
share one curriculum and are deliberately separate. Each works on its own. A third, hybrid mode is
planned (see the end).

| | **Offline classroom** | **Online AI teacher** |
|---|---|---|
| Who | One teacher and a group of children, two or three grades in one room | One learner (a child at home, an older learner, a teacher preparing) |
| Device | The teacher's phone and a ₹500 Bluetooth speaker | Any phone or laptop with a browser and a signal |
| Internet while in use | **None.** If the classroom has no signal, nothing breaks | **Required.** The app says so and points to the classroom mode when offline |
| How it teaches | Weekly signed lesson packs play as an audio episode; the teacher taps *Most / Some / Few got it* and the lesson switches to stretch, more practice or easier | A spoken conversation with an AI teacher that plans, teaches, quizzes, reteaches and takes breaks |
| Where it lives | `/teacher` (`app/src/teacher/`) | `/tutor` (`app/src/tutor/`, `backend/app/tutor/`) |
| How a learner reaches it | Through the teacher and the speaker; absent children through a catch-up phone call | Directly, by voice or typing |
| Cost per use | Almost nothing at run time (the pack is already on the phone) | A few Claude calls per turn, capped per day |

The app shows this everywhere: the landing page has a "Two modes" section, and both screens carry a
mode switch (`app/src/components/ModeSwitch.tsx`, driven by `app/src/lib/modes.ts`). The AI teacher
warns when the device is offline and links to the classroom mode.

## Offline classroom: what is in it

| Feature | Status |
|---|---|
| Signed lesson packs (Ed25519), import from file, Web Share, in-app download that resumes on 2G | Built. The live site refuses packs until `VITE_PACK_PUBLIC_KEY` is set on Vercel |
| Group lesson through the speaker, with checkpoints, a 10 s fallback to the core branch, the analogy button, the chalk sketch, materials | Built, tested in airplane mode ([TESTING_LOG.md](TESTING_LOG.md)) |
| The teacher's taps switch the branch; per-part results sync when a signal appears | Built |
| Choral mic sensing (suggests a branch; the teacher decides) | Built |
| Attendance saved offline | Built |
| Catch-up call to an absent child's parent on a basic phone, keys 1, 2, 3 answer back | Built, with a keypad simulator in Admin. Real calls need Exotel set up on Render ([EXOTEL.md](EXOTEL.md)); no real call made yet |
| A live two-way call between the teacher and the children (a group class by phone) | **Not built.** Only the one-way catch-up call exists |
| Teacher and student corrections beyond the tap loop (for example the teacher marking which children need more help) | **Not built.** Today the whole-class tap is the only signal |

## Online AI teacher: what is in it

| Feature | Status |
|---|---|
| Natural conversation first, in English, Hindi, Tamil or Odia | Built |
| Study mode: a topic, a PDF, a photo of a textbook page or a text file is analysed into 2 to 6 parts, one concept each, with a schedule | Built (a photo and a topic tested live; a PDF is not) |
| Each part is taught, then checked. It moves on only when the answer is right; wrong answers get a hint, then a second explanation, then the answer | Built, rules in `backend/app/tutor/engine.py` with tests |
| Interrupt at any time: explain again, like I'm 5, another language, a doubt; the lesson keeps its place | Built |
| Breaks and games after about 10 turns or 2 parts, or when the learner is tired: riddle, quick maths, number pattern, memory game, stretch | Built |
| Voice: browser speech recognition in, Sarvam voice out | Built; not tried with a real microphone or the real voice yet. Odia recognition in Chrome is weak |
| Perception agents: with the learner's opt-in, a LangGraph graph of four agents (face, posture, surroundings, response) reads on-device camera and microphone numbers and makes the teacher gently ask "is everything okay?" when the learner seems puzzled, tired or distracted, or the room is noisy | Built; tested with synthetic numbers and a fake camera. **Not yet tested with real faces**, and it needs legal review and parental consent before children use it. See [SENSE.md](SENSE.md) |
| The four lesson guardrails on the tutor's answers | **Not applied.** The tutor is checked by its rules and prompt only |
| Learner accounts, progress saved between visits, parental consent (DPDP Act 2023) | **Not built.** Nothing is stored; the lesson lives in the browser. Needed before real children use it |

Limits to be honest about: the tutor is open to anyone, so a daily cap on turns and spoken replies
protects the budget (`TUTOR_DAILY_TURNS`, `TUTOR_DAILY_VOICE`, default 600 each); and Claude, not code,
judges free-text answers, so an unusual right answer can fail and a clever wrong one can pass.

## Keeping the modes apart

- The classroom path must work in airplane mode, so it never imports tutor code. The tutor is a
  separate lazy chunk.
- Nothing in the tutor is needed to play a lesson; nothing in the classroom needs the tutor.
- The two share only the curriculum (`content/`), the voices (Sarvam) and the design.

## Hybrid (planned, not started)

The next step is for the two to help each other:

1. **Homework with the AI teacher.** A child at home continues the same lesson the class just
   heard. A pack's episode is turned into a tutor plan (`Plan` is already a plain JSON shape), so the
   AI teacher teaches the same concept the class had.
2. **The class taps guide the AI.** "Few got it" on a part becomes the first thing the AI teacher
   revisits for that class.
3. **The AI's results reach the CRP dashboard.** Parts passed, answers given away and revision lists
   (`Progress.revealed`) per child, with consent.
4. **Catch-up by AI, not just by call.** An absent child can finish the missed part with the AI
   teacher when the family has a smartphone, and the phone call stays for those who do not.

To add it: a third entry in `app/src/lib/modes.ts`, a bridge from an `Episode` to a tutor `Plan`,
and consent and storage for learner data (the missing piece listed above).
