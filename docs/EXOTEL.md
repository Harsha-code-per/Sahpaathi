# Real catch-up calls with Exotel

The Admin keypad simulator works with no setup. To ring a real phone, connect Exotel once. The code is `backend/app/ivr/exotel.py`; it drives the same call logic as the simulator (`backend/app/ivr/flow.py`).

**Keys on the call:** the parent hears the recap, then the menu: **1** hear it again, **2** my child understood, **3** we need help. If nobody presses a key, the menu plays once more, then the call ends as "no answer".

**Privacy:** Sahpaathi stores no phone numbers. The admin types the number when ringing; it goes to Exotel once and is not saved. Calling families for real needs a consented contact list per classroom (roadmap).

## 1. Exotel account values
From the Exotel dashboard (Settings → API): **Account SID**, **API key**, **API token**, the **subdomain** (`api.exotel.com`, or `api.in.exotel.com` on the Mumbai cluster), and one **ExoPhone** as the caller ID. Trial accounts can only call numbers verified in the dashboard.

## 2. Build the flow (App Bazaar → Create)
Make up a long random string for the webhook key (Render generates `EXOTEL_WEBHOOK_KEY`; copy it). `API` below is the backend URL, e.g. `https://sahpaathi-api.onrender.com`.

1. **Programmable Gather** applet, URL: `API/api/v1/ivr/exotel/gather?key=WEBHOOK_KEY`
2. **Passthru** applet after it (sync mode), URL: `API/api/v1/ivr/exotel/passthru?key=WEBHOOK_KEY`
   - on **200**: connect back to the Programmable Gather (the parent asked to hear it again)
   - on **302**: a **Hangup** applet (add a short thank-you Greeting before it if you like)
3. Save. The flow's number in **My Apps** is the `EXOTEL_FLOW_ID`.

## 3. Settings on Render
`EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN`, `EXOTEL_CALLER_ID`, `EXOTEL_FLOW_ID`, `EXOTEL_WEBHOOK_KEY`, and `PUBLIC_API_URL` (the backend URL above). `render.yaml` lists them for new services; on the existing service add them under Environment.

## 4. Try it
Admin → Catch-up calls → a queued call → **Ring a phone**, with a team phone. The call needs a lesson pack built after call audio existed (Admin → Lesson packs → Build). The list shows the result when the call ends: answered with the key pressed, or no answer.

## How it works
- `POST /api/v1/ivr/calls/{id}/dial` (admin): starts the call on the newest ready pack and asks Exotel (`Calls/connect`) to ring the number into the flow, with the call id as `CustomField`. If Exotel refuses, the call goes back to queued.
- `GET /exotel/gather`: Exotel's Programmable Gather JSON: the recap and menu as one audio URL, one digit, 8 s to press, the menu alone on a repeat.
- `GET /exotel/passthru`: applies the digit to the call; 200 to play it again, 302 to hang up.
- `GET /exotel/audio/{call}/{start|menu}.wav`: the pack's Opus audio as 8 kHz mono WAV, signed per call because Exotel sends no login.
- `/exotel/status/{call}`: Exotel's status callback; a call that ends unanswered is marked no answer.
- Exotel's webhooks are not signed, so their URLs carry `EXOTEL_WEBHOOK_KEY`; without it they answer 404.
