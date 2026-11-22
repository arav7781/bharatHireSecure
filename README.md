# BharatHire

An AI interview room with proctoring built in. A voice interviewer asks questions generated from a topic video,
while a local monitoring service watches for the tools people use to cheat in remote interviews (overlay apps,
screen mirrors, remote-desktop and AI helpers) and records every finding in an audit log.

The app lives in [`bhararhire/`](bhararhire).

## Pieces

| Component | Path | What it does |
| --- | --- | --- |
| Proctoring API | `bhararhire/app/server.mjs` | Node.js/Express service (port 3001). Lists running processes, matches them against ~70 signatures across cheating, communication, browser, development, emulation and AI-assistant categories, flags packed Electron apps, scores the session and can terminate offending processes |
| Interview room | `bhararhire/app/` | Next.js front end with a LiveKit (WebRTC) call, live transcript and audio-only mode |
| Voice interviewer | `bhararhire/backend/utube.py` | LiveKit agent: pulls a YouTube transcript, generates questions with Llama 3.3 on Groq, evaluates each answer and moves on. Deepgram for speech, Silero VAD, turn detection |
| Webcam check | `bhararhire/backend/yolo.py` | Flask service streaming YOLO11 object detection on the candidate's camera (port 5000) |

### Proctoring API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/check-processes` | Pre-interview scan; blocks the session on critical findings |
| POST | `/api/monitor-processes` | Periodic scan during the interview |
| POST | `/api/terminate-processes` | Kill flagged processes by PID |
| GET | `/api/system-info` | Host details for the report |
| GET | `/api/session/:sessionId` | Findings for one session |
| GET / POST | `/api/audit-logs` | Read or append audit entries |
| GET | `/api/analytics` | Aggregate violation stats |

## Run locally

```bash
cd bhararhire
pnpm install
pnpm server        # proctoring API on :3001
pnpm dev           # Next.js on :3000

# voice interviewer (needs LIVEKIT_*, GROQ_API_KEY, DEEPGRAM_API_KEY in .env)
python backend/utube.py dev
```

## Tech

Node.js · Express · Next.js · TypeScript · LiveKit · WebRTC · Python · Groq · Deepgram · Ultralytics YOLO11 · Flask
