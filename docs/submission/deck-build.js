// Build-stage deck, on the same visual system as the Ideate deck (lib.js copied from A1pha_SlateLens).
const { make, C } = require("./deck-lib");
const { SLATE, SLATE2, INK, MUTED, MARI, TEAL, CORAL, LIGHT, WHITE, SOFT } = C;
const mentor = require("./mentor.json");
const DEMO = "https://sahpaathi.vercel.app";
const REPO = "https://github.com/Harsha-code-per/Sahpaathi";

(async () => {
  const d = await make("Sahpaathi  ·  Team A1pha  ·  Classroom Complexity  ·  Build stage", "Sahpaathi — Build stage — Team A1pha");
  const { pres, T, card, circ, header, bullets, team } = d;

  // Title
  {
    const s = pres.addSlide();
    s.background = { color: SLATE };
    T(s, "AI FOR FOUNDATIONAL LEARNING HACKATHON 2026  ·  BUILD STAGE", { x: 0.7, y: 0.8, w: 10, h: 0.3, fontSize: 12, bold: true, color: MARI, charSpacing: 3 });
    T(s, "Sahpaathi", { x: 0.7, y: 1.45, w: 8, h: 1.2, fontSize: 66, bold: true, color: WHITE });
    T(s, "A classroom companion in a ₹500 speaker.\nThe teacher works closely with one group; Sahpaathi keeps\nanother engaged, in the children's home language, with no internet.", { x: 0.7, y: 2.8, w: 8.2, h: 1.5, fontSize: 21, color: SOFT });
    card(s, 0.7, 4.65, 7.9, 1.75, SLATE2);
    T(s, [
      { text: "Live demo  ", options: { bold: true, color: MARI } }, { text: "sahpaathi.vercel.app", options: { color: WHITE, hyperlink: { url: DEMO }, breakLine: true } },
      { text: "Source  ", options: { bold: true, color: MARI } }, { text: "github.com/Harsha-code-per/Sahpaathi", options: { color: WHITE, hyperlink: { url: REPO }, breakLine: true } },
      { text: "Challenge  ", options: { bold: true, color: MARI } }, { text: "Classroom Complexity (1A language, 1B multigrade)", options: { color: WHITE, breakLine: true } },
      { text: "Team  ", options: { bold: true, color: MARI } }, { text: "A1pha", options: { color: WHITE, breakLine: true } },
      { text: "Test accounts and sample inputs: last slide", options: { color: SOFT, italic: true } },
    ], { x: 0.95, y: 4.72, w: 7.4, h: 1.6, fontSize: 14.5, valign: "middle" });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.9, y: 2.0, w: 2.2, h: 3.2, fill: { color: SLATE2 }, line: { color: MARI, width: 2 }, rectRadius: 0.3 });
    s.addShape(pres.shapes.OVAL, { x: 10.25, y: 2.35, w: 1.5, h: 1.5, fill: { color: SLATE }, line: { color: MARI, width: 3 } });
    s.addShape(pres.shapes.OVAL, { x: 10.65, y: 2.75, w: 0.7, h: 0.7, fill: { color: MARI }, line: { color: MARI } });
    s.addShape(pres.shapes.OVAL, { x: 10.55, y: 4.15, w: 0.9, h: 0.9, fill: { color: SLATE }, line: { color: TEAL, width: 3 } });
  }

  // What we built, and what changed from the Ideate deck
  {
    const s = pres.addSlide();
    header(s, "What was built", "The Ideate plan is now a working classroom loop");
    const steps = [["FaMagic", "Write", "Claude writes a structured audio activity for a chapter and a district: pauses, cues, three branches."],
      ["FaShieldAlt", "Check", "Code, an AI reviewer and back-translation check it. A human approves every line."],
      ["FaVolumeUp", "Voice + pack", "Approved lessons are voiced and signed into a pack of about 1 MB."],
      ["FaMobileAlt", "Teach offline", "One tap to start. Most / Some / Few picks the next branch on the phone."],
      ["FaPhoneAlt", "Follow up", "Absences queue catch-up calls. Taps reach the block dashboard on next signal."]];
    for (let i = 0; i < 5; i++) {
      const x = 0.6 + i * 2.45;
      card(s, x, 1.62, 2.3, 2.1, i === 3 ? SLATE : LIGHT);
      await circ(s, x + 0.18, 1.76, 0.56, i === 3 ? MARI : TEAL, steps[i][0], i === 3 ? INK : WHITE);
      T(s, steps[i][1], { x: x + 0.85, y: 1.76, w: 1.4, h: 0.56, fontSize: 14.5, bold: true, color: i === 3 ? WHITE : INK, valign: "middle" });
      T(s, steps[i][2], { x: x + 0.18, y: 2.42, w: 1.98, h: 1.25, fontSize: 11.5, color: i === 3 ? SOFT : INK });
    }
    T(s, "What changed from the Ideate deck, and why", { x: 0.6, y: 3.9, w: 12, h: 0.32, fontSize: 15, bold: true });
    const rows = [
      ["Ideate deck", "What shipped", "Why"],
      ["“AI co-teacher”", "“Classroom companion”; same loop", "Education mentor: claim engagement, and support the teacher"],
      ["Kotlin / React Native app", "Installable web app (PWA)", "A link installs it: no app store, and evaluators can open it"],
      ["Bhashini, IndicTrans2, Indic TTS", "Sarvam Bulbul v3 voices", "Tamil, Hindi, Odia and English from one API"],
      ["RAG over textbooks (pgvector)", "Curated chapters + NIPUN outcomes", "8 chapters needed accuracy, not search"],
      ["22 languages, Santali to Odia showcase", "Lessons in Tamil, Hindi, English; Odia app text and voice ready", "No Odia lesson yet: it waits on Santali, with 0 of 42 phrases recorded"],
      ["Free call-back on real phones", "Full IVR flow + keypad simulator", "Exotel code is ready; not yet connected to a live number"],
    ].map((r, i) => r.map((t) => ({ text: t, options: { bold: i === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? WHITE : LIGHT } } })));
    s.addTable(rows, { x: 0.6, y: 4.27, w: 12.13, colW: [3.5, 3.9, 4.73], fontFace: "Calibri", fontSize: 11, border: { type: "none" }, rowH: 0.36, valign: "middle", margin: [3, 8, 3, 8] });
  }

  // AI layers
  {
    const s = pres.addSlide();
    header(s, "AI use and technical strength · 1", "AI runs once per lesson in the cloud; the classroom replays it");
    const rows = [
      ["Layer", "What happens", "AI or code", "Where in the repo"],
      ["Data input", "Chapter text, NIPUN outcome, district profile (languages, names, crops, free props), class taps", "No AI: curated data", "content/"],
      ["Processing", "Writes the lesson as schema-bound JSON: parts, pauses, cues, easier / core / stretch, analogy, call recap, chalk sketch", "Claude Sonnet 5.5", "backend/app/factory/"],
      ["Guardrails", "Rules and arithmetic, then rubric review with one auto-repair, then blind back-translation, then human approval", "Code + Claude Haiku 5.5 + reviewer", "factory/, Studio"],
      ["Evaluation", "Scores saved per lesson; 20 planted-defect test; in class, % Most got it per part; call completion", "Code + Haiku", "eval_guardrails, /insights"],
      ["Output", "Voice normalised to -16 LUFS, signed pack, offline player, phone recap", "Sarvam Bulbul v3, ffmpeg, Ed25519", "voice/, app/src/teacher/, ivr/"],
    ].map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 0 || j === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.6, w: 12.13, colW: [1.45, 5.75, 2.5, 2.43], fontFace: "Calibri", fontSize: 12, border: { type: "none" }, rowH: [0.38, 0.56, 0.56, 0.56, 0.56, 0.56], valign: "middle", margin: [3, 8, 3, 8] });
    card(s, 0.6, 5.0, 5.95, 1.85, LIGHT);
    T(s, "Other LLM calls", { x: 0.8, y: 5.08, w: 5.5, h: 0.3, fontSize: 13.5, bold: true, color: TEAL });
    T(s, bullets([
      "Feedback loop: Claude rewrites the part classes struggled with, and it goes back through review",
      "Teacher recordings: Sarvam speech-to-text, then Haiku gives tips on clarity, pace and safety",
      "Parent helper prototype at /tutor: Sonnet plans a topic, Haiku judges answers and phrases replies",
    ]), { x: 0.8, y: 5.4, w: 5.6, h: 1.4, fontSize: 12 });
    card(s, 6.78, 5.0, 5.95, 1.85, SLATE);
    T(s, "Why this design", { x: 7.0, y: 5.08, w: 5.5, h: 0.3, fontSize: 13.5, bold: true, color: MARI });
    T(s, [{ text: "No LLM runs in the classroom, so nothing there needs a network, and a mistake cannot reach children live.", options: { breakLine: true } },
      { text: "Branching is plain code on the phone. In the parent helper, code rules decide pass, hint and reteach: the model does not.", options: {} }], { x: 7.0, y: 5.4, w: 5.55, h: 1.4, fontSize: 12.5, color: WHITE });
  }

  // Guardrails
  {
    const s = pres.addSlide();
    header(s, "AI use and technical strength · 2", "Four guardrails stand between an AI draft and a child");
    const g = [["1", "Code", "Schema, rule checks, every sum recomputed, language handover checked", TEAL],
      ["2", "AI rubric", "Haiku scores pedagogy, age fit, accuracy, language bridge, localisation and safety; one auto-repair", CORAL],
      ["3", "Back-translation", "A blind English translation sits beside every line, so a reviewer can catch meaning drift", MARI],
      ["4", "Human", "A native speaker edits lines and approves. Nothing is voiced until then. The AI's original is kept", SLATE2]];
    g.forEach(([n, t, b, col], i) => {
      const x = 0.6 + i * 3.07;
      card(s, x, 1.62, 2.92, 2.2, LIGHT);
      s.addShape(pres.shapes.OVAL, { x: x + 0.18, y: 1.78, w: 0.5, h: 0.5, fill: { color: col }, line: { color: col } });
      T(s, n, { x: x + 0.18, y: 1.78, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: col === MARI ? INK : WHITE, align: "center", valign: "middle" });
      T(s, t, { x: x + 0.8, y: 1.78, w: 2.05, h: 0.5, fontSize: 15, bold: true, valign: "middle" });
      T(s, b, { x: x + 0.18, y: 2.42, w: 2.58, h: 1.35, fontSize: 12.5 });
    });
    card(s, 0.6, 4.0, 5.2, 2.88, SLATE);
    T(s, "MEASURED ON PLANTED DEFECTS", { x: 0.85, y: 4.13, w: 4.8, h: 0.3, fontSize: 11, bold: true, color: MARI, charSpacing: 2 });
    T(s, "18 / 20", { x: 0.85, y: 4.45, w: 2.3, h: 0.85, fontSize: 40, bold: true, color: MARI, valign: "middle" });
    T(s, "caught and pinpointed by code or the AI reviewer", { x: 3.1, y: 4.45, w: 2.55, h: 0.85, fontSize: 12.5, color: WHITE, valign: "middle" });
    T(s, "20 / 20", { x: 0.85, y: 5.3, w: 2.3, h: 0.7, fontSize: 30, bold: true, color: WHITE, valign: "middle" });
    T(s, "caught by any tier, before a human looks", { x: 3.1, y: 5.3, w: 2.55, h: 0.7, fontSize: 12.5, color: WHITE, valign: "middle" });
    T(s, "Wrong sums, beyond-grade maths, unsafe instructions, dropped home language, answers given too early. Small sample: 3 lessons, one run (21 Oct).", { x: 0.85, y: 6.03, w: 4.8, h: 0.78, fontSize: 11, color: SOFT });
    T(s, "Beyond the lesson", { x: 6.05, y: 4.0, w: 6.6, h: 0.3, fontSize: 14, bold: true });
    T(s, bullets([
      "Packs are Ed25519-signed with sha256 hashes: the app refuses a tampered pack",
      "Audio QA: each line within 1.5 LU of -16 LUFS, none over 45 s, pack under 2 MB",
      "Choral mic only suggests a branch; the teacher decides. No tap in 10 s falls back to Core",
      "No child names or phone numbers: classrooms and roll numbers are opaque codes",
      "Paid and public endpoints have daily caps stored in the database, returning HTTP 429",
      "Honest limit: the parent helper prototype does not pass through the four lesson guardrails; camera sensing is off and has not been tested on real faces",
    ]), { x: 6.05, y: 4.33, w: 6.68, h: 2.55, fontSize: 12.5, paraSpaceAfter: 3 });
  }

  // Real scenarios
  {
    const s = pres.addSlide();
    header(s, "AI use and technical strength · 3", "Built for no signal, little data and a ₹7,000 phone");
    const rows = [
      ["Part", "Needs network?", "What happens offline"],
      ["Player, branching, analogy, attendance, mic hint", "No", "Works fully in airplane mode after one visit"],
      ["Taps and attendance sync", "Any signal", "Queued on the phone; retried every 30 s, sent in one small request"],
      ["New lessons", "Any signal, resumable", "A dropped download resumes; packs also pass by file share or SD card"],
      ["Catch-up call", "Voice network only", "The parent needs no data or smartphone; the call waits for the sync"],
      ["Studio, Admin, lesson generation", "Yes (desk tools)", "Not on the classroom path"],
      ["Parent helper at /tutor", "Yes (prototype)", "App warns and points back to the offline classroom"],
    ].map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 0 || j === 1, color: i === 0 ? WHITE : j === 1 && (t === "No") ? TEAL : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.6, w: 12.13, colW: [4.4, 2.1, 5.63], fontFace: "Calibri", fontSize: 12.5, border: { type: "none" }, rowH: 0.42, valign: "middle", margin: [3, 8, 3, 8] });
    const m = [["0.5 s", "repeat load on Slow 3G with 4× slower CPU (lab)"], ["96 KB", "first-visit transfer, 6.6 s to lesson list (lab)"], ["~1.1 MB", "a voiced lesson of about 10 minutes, opus 16 kbps"], ["100", "Lighthouse accessibility, mobile"]];
    m.forEach(([n, l], i) => {
      const x = 0.6 + i * 3.07;
      card(s, x, 4.86, 2.92, 1.24, i % 2 ? LIGHT : SLATE);
      T(s, n, { x: x + 0.15, y: 4.9, w: 2.62, h: 0.55, fontSize: 24, bold: true, color: i % 2 ? CORAL : MARI, valign: "middle" });
      T(s, l, { x: x + 0.15, y: 5.46, w: 2.62, h: 0.58, fontSize: 11.5, color: i % 2 ? INK : WHITE });
    });
    T(s, "Hardware: any Android with Chrome, a Bluetooth or AUX speaker, any keypad phone at home. Also run on a moto g34. Still to do: the 3-metre speaker test in a real room, and a ₹7,000 phone.", { x: 0.6, y: 6.25, w: 12.13, h: 0.65, fontSize: 12.5, color: MUTED, italic: true });
  }

  // User inputs 1: mentors
  {
    const s = pres.addSlide();
    header(s, "User inputs and testing · 1", mentor.title);
    T(s, mentor.subtitle, { x: 0.6, y: 1.5, w: 12.13, h: 0.4, fontSize: 13.5, color: MUTED });
    const rows = [["What we heard", "What we did", "Where it is"], ...mentor.rows].map((r, i) => r.map((t) => ({ text: t, options: { bold: i === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.98, w: 12.13, colW: [4.7, 5.0, 2.43], fontFace: "Calibri", fontSize: 12.5, border: { type: "none" }, valign: "middle", margin: [3, 8, 3, 8] });
    card(s, 0.6, 5.72, 12.13, 1.15, SLATE);
    T(s, [{ text: "Honest status  ", options: { bold: true, color: MARI } }, { text: mentor.status, options: { color: WHITE } }], { x: 0.85, y: 5.8, w: 11.65, h: 1.0, fontSize: 13, valign: "middle" });
  }

  // User inputs 2: engineering tests
  {
    const s = pres.addSlide();
    header(s, "User inputs and testing · 2", "Every test that failed changed the product");
    const rows = [
      ["Date", "Test", "What we saw", "What we changed"],
      ["19 Oct", "Airplane mode, then back online", "Queue waited for an app reopen: the only sync attempt ran before data flowed", "Retry every 30 s (PR #43). It then drained 20 s after the API returned"],
      ["19 Oct", "Voice QA on 3 real packs", "2 of 3 failed on one quiet line (-18.8 and -17.6 LUFS)", "Gain re-measured on the encoded line; all 3 now pass"],
      ["21 Oct", "Clicking through the live site", "White screens after deploys, and a crash on sending a tutor message", "Fixed; every PR now runs a browser test of each page, plus accessibility"],
      ["25 Oct", "moto g34: full lesson", "A lesson needs pause, a screen that stays on, and protection from a mistaken back press", "Pause and resume, screen wake lock, confirm before leaving"],
      ["1 Nov", "Pre-submission audit of live flows", "The live site played no sound: packs failed on a rejected voice key, and built-in lessons were text only", mentor.auditFix],
    ].map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 0 || j === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.6, w: 12.13, colW: [0.9, 2.9, 4.25, 4.08], fontFace: "Calibri", fontSize: 12, border: { type: "none" }, valign: "middle", margin: [3, 8, 3, 8] });
    card(s, 0.6, 5.2, 12.13, 1.05, SLATE);
    T(s, [{ text: "Metrics promised in the Ideate deck  ", options: { bold: true, color: MARI } },
      { text: "0 MB in the classroom: shown. +20 guided minutes, 80% Most got it, 60% catch-up calls completed: not measured yet, because the school pilot has not happened. They move to the pilot.", options: { color: WHITE } }], { x: 0.85, y: 5.26, w: 11.65, h: 0.93, fontSize: 13, valign: "middle" });
    T(s, "These are team and device tests, not classroom results. Automated: 272 backend and 229 app tests, plus browser smoke tests on desktop and phone, on every pull request.", { x: 0.6, y: 6.38, w: 12.13, h: 0.5, fontSize: 12.5, italic: true, color: MUTED });
  }

  // Roadmap 1
  {
    const s = pres.addSlide();
    header(s, "Future roadmap · 1", "Next: from a working loop to proof in real classrooms");
    const c = [["FaChalkboardTeacher", "Next 4 weeks", TEAL, ["Teacher sessions with written consent, using our interview guide and log; test whether Grade 2 children can follow the instructions", "Native-speaker review of Tamil, Hindi and Odia lines and voices; compare scripts with Pratham's audio and SCERT teacher guides", "Run the 3 m speaker test on a real ₹7k phone", "Connect Exotel and make the first real catch-up call"]],
      ["FaSchool", "Next 3 months", MARI, ["Pilot 10 to 20 multigrade schools with one DIET or Block Resource Centre", "Measure engaged minutes per child, % Most got it after branching, call completion; only then test learning", "Feed SCERT teacher guides into generation; collect recorded data with a rubric to improve voices", "Add literacy, aligned to NIPUN Bharat"]],
      ["FaLanguage", "Languages", CORAL, ["Scheduled languages through Indic TTS, each with a native reviewer", "Tribal languages (Santali first, then Gondi, Bhili, Kui) through consented community phrase banks; the splicer is built"]],
      ["FaUserGraduate", "Parent helper (prototype)", SLATE2, ["Add the four guardrails to its answers", "Verifiable parental consent (DPDP Act 2023) and legal review before any child uses camera sensing", "Real-data training only from consented pilots"]]];
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 3.07;
      card(s, x, 1.62, 2.92, 5.2, LIGHT);
      await circ(s, x + 0.18, 1.78, 0.56, c[i][2], c[i][0], c[i][2] === MARI ? INK : WHITE);
      T(s, c[i][1], { x: x + 0.85, y: 1.78, w: 2.0, h: 0.56, fontSize: 14.5, bold: true, valign: "middle" });
      T(s, bullets(c[i][3]), { x: x + 0.18, y: 2.5, w: 2.6, h: 4.2, fontSize: 12.5, paraSpaceAfter: 6 });
    }
  }

  // Roadmap 2
  {
    const s = pres.addSlide();
    header(s, "Future roadmap · 2", "It plugs into systems that exist, at a few rupees per child");
    const rows = [
      ["Existing system", "How Sahpaathi fits"],
      ["NIPUN Bharat, Samagra Shiksha", "Lessons tagged by learning outcome; dashboards roll up to block and district"],
      ["CRPs", "Already visit monthly: carry packs by phone or SD card, and see the dashboard"],
      ["DIKSHA", "Publish approved lessons and chalk-sketch cards as open content"],
      ["State IVR, community radio", "The same audio plays on existing lines and slots"],
    ].map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 0 || j === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.6, w: 6.55, colW: [2.45, 4.1], fontFace: "Calibri", fontSize: 12.5, border: { type: "none" }, valign: "middle", margin: [3, 8, 3, 8] });
    card(s, 7.4, 1.6, 5.33, 3.06, SLATE);
    T(s, "PER CHILD PER YEAR, MODELLED", { x: 7.65, y: 1.72, w: 4.9, h: 0.3, fontSize: 11, bold: true, color: MARI, charSpacing: 2 });
    T(s, "₹6", { x: 7.65, y: 2.05, w: 1.7, h: 0.95, fontSize: 44, bold: true, color: MARI, valign: "middle" });
    T(s, "without calls, at 1,00,000 classrooms", { x: 9.3, y: 2.05, w: 3.25, h: 0.95, fontSize: 13.5, color: WHITE, valign: "middle" });
    T(s, "₹93", { x: 7.65, y: 3.05, w: 1.7, h: 0.8, fontSize: 33, bold: true, color: WHITE, valign: "middle" });
    T(s, "with a call for each absence", { x: 9.3, y: 3.05, w: 3.25, h: 0.8, fontSize: 13.5, color: WHITE, valign: "middle" });
    T(s, "A lesson costs about ₹205 once. Calls are about 90% of cost at scale, at an estimated ₹1 a minute; confirm with Exotel's rate card.", { x: 7.65, y: 3.88, w: 4.9, h: 0.72, fontSize: 11, color: SOFT });
    card(s, 0.6, 4.9, 12.13, 1.95, LIGHT);
    T(s, "Adoption path", { x: 0.85, y: 5.0, w: 6, h: 0.3, fontSize: 14, bold: true, color: TEAL });
    const p = [["1", "One DIET or BRC", "names schools and reviewers"], ["2", "Reviewer approves", "lessons per language and grade"], ["3", "CRP carries packs", "to schools with no signal"], ["4", "Block officer sees", "which lessons and classes need help"]];
    p.forEach(([n, a, b], i) => {
      const x = 0.85 + i * 2.95;
      s.addShape(pres.shapes.OVAL, { x, y: 5.45, w: 0.46, h: 0.46, fill: { color: TEAL }, line: { color: TEAL } });
      T(s, n, { x, y: 5.45, w: 0.46, h: 0.46, fontSize: 13, bold: true, color: WHITE, align: "center", valign: "middle" });
      T(s, [{ text: a, options: { bold: true, breakLine: true } }, { text: b, options: { color: MUTED, fontSize: 11.5 } }], { x: x + 0.56, y: 5.38, w: 2.3, h: 1.2, fontSize: 13 });
    });
  }

  // Evaluator guide
  {
    const s = pres.addSlide();
    header(s, "For evaluators", "How to test it: accounts, five sample inputs, offline steps");
    const rows = [
      ["Role", "Open", "Email", "Password"],
      ["Teacher", "/teacher (no login to play)", "teacher@sahpaathi.test", "sahpaathi#01"],
      ["Reviewer", "/studio", "reviewer@sahpaathi.test", "sahpaathi#01"],
      ["Admin / block officer", "/admin", "admin@sahpaathi.test", "sahpaathi#01"],
      ["Parent helper", "/tutor (no login)", "none", "none"],
    ].map((r, i) => r.map((t, j) => ({ text: t, options: { bold: i === 0 || j === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? SLATE : i % 2 ? LIGHT : WHITE } } })));
    s.addTable(rows, { x: 0.6, y: 1.55, w: 7.5, colW: [1.85, 2.2, 2.25, 1.2], fontFace: "Calibri", fontSize: 11.5, border: { type: "none" }, rowH: 0.36, valign: "middle", margin: [3, 6, 3, 6] });
    card(s, 8.3, 1.55, 4.43, 1.84, SLATE);
    T(s, "Test it offline", { x: 8.5, y: 1.62, w: 4, h: 0.3, fontSize: 13.5, bold: true, color: MARI });
    T(s, ["Open /teacher in Android Chrome", "Add to Home screen (optional)", "Wait for a few seconds, then turn on airplane mode", "Open a lesson and tap Most / Some / Few"].map((t, i, a) => ({ text: `${i + 1}. ${t}`, options: { breakLine: i < a.length - 1 } })), { x: 8.5, y: 1.93, w: 4.1, h: 1.42, fontSize: 12, color: WHITE });
    T(s, "Five sample inputs", { x: 0.6, y: 3.53, w: 8, h: 0.3, fontSize: 14, bold: true });
    const sample = [
      ["Teacher", "Open “Counting to three with pebbles”, read Set up the room, Start. Listen, tap Few got it, then Most got it at the next check. Let one check run out: it continues after 10 s."],
      ["Teacher", "Under Lessons > Get new lessons, sign in and download “Numbers to 999” (Grade 3, Tamil). Turn on airplane mode and play the voiced lesson."],
      ["Reviewer", "In /studio open the Grade 3 Madurai lesson. Read each Tamil line beside its back-translation and AI scores, correct a line with the pencil, then approve or reject."],
      ["Admin", "In /admin load the labelled sample data to see the class-health board, then open Catch-up calls, queue roll number R-07, and press 1, 2 or 3 on the keypad simulator."],
      ["Parent helper", "In /tutor turn on Study and type “place value of two-digit numbers”. Answer one question wrongly, then say “explain in Hindi” and “I am tired”."],
    ];
    sample.forEach(([r, t], i) => {
      const y = 3.87 + i * 0.6;
      card(s, 0.6, y, 12.13, 0.54, i % 2 ? WHITE : LIGHT);
      T(s, `${i + 1}  ${r}`, { x: 0.75, y, w: 1.4, h: 0.54, fontSize: 12, bold: true, color: TEAL, valign: "middle" });
      T(s, t, { x: 2.15, y, w: 10.5, h: 0.54, fontSize: 11.5, valign: "middle" });
    });
  }

  await team(pres.addSlide(), "Sahpaathi: a classroom companion for the group the teacher can't reach right now.");
  await pres.writeFile({ fileName: "Sahpaathi_A1pha_Build.pptx" });
})();
