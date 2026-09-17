# Porter-Style AI Voice Booking Agent

> A resilient, voice-native AI agent designed for Porter intra-city moving and logistics, built with Next.js 14, TypeScript, and a decoupled dual-pass state machine with deterministic business guardrails.

---

## 🚀 Live Demo & Video Walkthrough

- **Live Demo URL**: Deployable with 1-click on [Vercel](https://vercel.com) (or check deployment link in submission email).
- **Submission Email**: `annmary2310@gmail.com`

---

## 🎯 Objective & Problem Statement

Turning messy, unstructured, voice conversations into a structured, validated, and complete booking state is notoriously challenging. Real-world callers:
- Provide information out of order (*"3rd floor no lift... oh and pickup is HSR"*).
- Make vague statements (*"I need to move a few things from Koramangala to Whitefield tomorrow evening"*).
- Contradict earlier statements (*"Actually wait, don't pick up from Koramangala, make it Indiranagar"*).
- Incur speech-to-text phonetic mis-transcriptions (*"Core Mangala"*, *"White Field"*).
- Request impossible moves (*"Move yesterday"*, *"Transport 2 gas cylinders and a pet dog"*).
- Interrupt the assistant mid-sentence (barge-in).

This project focuses on the **AI conversational layer and negative paths**, ensuring that the agent remains natural, never guesses when it should ask, and protects business constraints deterministically.

---

## 🏗️ Architecture & Approach

Rather than relying on a monolithic prompt that is prone to hallucination and amnesia, this application implements a **Decoupled Dual-Pass Architecture**:

```
[ User Speech ] ──► [ Pass 1: Extractor LLM ] ──► [ Deterministic State Reducer & Guardrails ] ──► [ Pass 2: Synthesizer LLM ] ──► [ Voice Audio ]
```

1. **Pass 1: Structured Extractor (Groq Llama-3.3-70B / OpenAI GPT-4o-mini)**
   - Extracts newly spoken entities, relative dates, and intent into a strict JSON delta.
   - Detects negative paths: slot overrides, vague cargo phrases (`isVagueInventory`), hazardous items, and off-topic detours.
2. **Deterministic State Reducer & Validation Engine (Zero-Hallucination Core)**
   - Merges delta into an immutable state store.
   - Rejects past dates strictly via code (`parsedDate < today()`).
   - Filters prohibited goods (gas cylinders, chemicals, live animals, cash).
   - Normalizes phonetic Indian localities (e.g. *Koramangala, Indiranagar, HSR Layout, Whitefield*).
   - Calculates cubic volume, weight, and Porter vehicle recommendation (*Tata Ace, Pickup 8ft, Canter 14ft*).
   - Calculates helper crew requirements based on floor accessibility and elevator presence.
   - Logs every slot change in a `revisionHistory` audit trail.
3. **Pass 2: Conversational Synthesizer**
   - Conditioned on missing mandatory fields and detected corrections.
   - Acknowledges user corrections first.
   - Never repeats questions for already verified fields.
   - Naturally bundles missing questions (e.g., asking about floor access at both ends together).
   - Once all requirements are satisfied, delivers a crisp verbal summary and seeks confirmation.

*For an in-depth dive into the state machine and sizing matrix, see [ARCHITECTURE.md](./ARCHITECTURE.md).*

---

## 🛡️ Negative Path Handling (Evaluation Rubric)

| Negative Path | How The Agent Handles It |
| :--- | :--- |
| **Ambiguity ("A few things")** | Flags `inventory.isVague: true`. Never guesses truck size; asks whether cargo is large furniture (bed/sofa) or boxes. |
| **Corrections & Contradictions** | Detects slot overwrites (e.g. Koramangala $\rightarrow$ Indiranagar), logs to audit trail, and confirms explicitly before moving forward. |
| **STT Phonetic Errors** | Phonetic normalizer repairs Bengaluru localities (*"Core Mangala"* $\rightarrow$ *Koramangala*; *"White Field"* $\rightarrow$ *Whitefield*). |
| **Past Dates** | Deterministic check rejects dates $< \text{today}$. Assistant prompts: *"That date has already passed. Schedule for today or tomorrow?"* |
| **Hazardous / Prohibited Items** | Prohibited goods detector blocks hazardous materials (fuel, gas cylinders, pets) and politely informs customer of policy. |
| **Silence / Timeout** | 7-second audio silence timer triggers gentle re-engagement: *"I didn't catch that. Are you still looking to book a move?"* |
| **Barge-In / Interruptions** | Instant audio cancellation (`window.speechSynthesis.cancel()`) when user begins speaking or taps mic. |
| **Off-Topic Detours** | Polite 1-sentence deflection (e.g., about weather) + seamless bridge back to uncollected booking details. |

---

## 📦 Component Structure

```
porter-voice-agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts        # Turn processor: extraction + reducer + synthesis
│   │   │   └── transcribe/route.ts  # Audio Whisper STT proxy
│   │   ├── layout.tsx               # App root layout with SEO metadata
│   │   ├── page.tsx                 # Main voice hub & workspace layout
│   │   └── globals.css              # Luxury Porter theme (vanilla CSS, glassmorphism)
│   ├── components/
│   │   ├── VoiceController.tsx      # Mic button, audio visualizer, barge-in, text input
│   │   ├── LiveTranscript.tsx       # Live chat stream with correction badges
│   │   ├── BookingCard.tsx          # Real-time requirements card (route, inventory, truck)
│   │   ├── NegativePathBadges.tsx   # AI reasoning inspector & state audit log
│   │   ├── ScenarioPicker.tsx       # 1-click evaluator test scenarios
│   │   └── ConfirmationModal.tsx    # Final summary modal with JSON export & confetti
│   ├── lib/
│   │   ├── ai/                      # Extractor, prompts, and dual-pass engine
│   │   ├── speech/                  # Client Web Speech API manager & normalizer
│   │   ├── state/                   # Reducer, state machine, and completion calculator
│   │   └── validation/              # Zod schemas, vehicle sizing, and helper logic
│   └── tests/
│       ├── unit/validation.test.ts  # Rules, past dates, vehicle sizing unit tests
│       ├── unit/stateMachine.test.ts# Contradiction, audit log, and reducer unit tests
│       └── e2e/conversationScenarios.test.ts # Replay dialogues for negative paths
├── ARCHITECTURE.md                  # Comprehensive architectural specification
├── package.json
└── tsconfig.json
```

---

## 🧪 Testing Strategy & Execution

The repository features 18 automated tests across 3 comprehensive suites verifying rules, state mutations, and end-to-end conversation replays:

```bash
# Run the automated test suite
npm test
```

### Test Suite Summary:
- ✔ **Validation & Domain Rules**: Past date rejection, Indian locality STT repair, floor/elevator parsing, vehicle sizing, prohibited cargo blocking, helper calculations.
- ✔ **Deterministic State Machine**: Initial state creation, entity absorption across turns, contradiction detection and audit trail generation, vague cargo phase transitions, confirmation transition.
- ✔ **E2E Conversational Flow Replays**: Replay simulations for the assessment prompt, contradiction recovery, past date guidance, hazardous cargo refusal, and off-topic deflection.

---

## 🛠️ Setup & Installation Instructions

### Prerequisites
- Node.js 18.x, 20.x, or 24.x
- npm 9+ or yarn

### 1. Clone the repository
```bash
git clone https://github.com/your-username/porter-voice-agent.git
cd porter-voice-agent
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables (Optional)
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Add your API key (e.g. `GROQ_API_KEY` for sub-300ms responses or `OPENAI_API_KEY`).
> **Note**: If no API key is provided, the application runs seamlessly using its built-in deterministic local state extractor and rule-based conversational synthesizer.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Production Build
```bash
npm run build
npm start
```

---

## 🚢 Deployment (Vercel)

This application is architected for zero-configuration deployment on **Vercel**:
1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add `GROQ_API_KEY` or `OPENAI_API_KEY` under **Environment Variables**.
4. Deploy! The application is fully HTTPS-ready (required for browser microphone access).

---

## 📌 Assumptions & Known Limitations

1. **Geographical Scope**: Primary locality normalizers are tuned for Bengaluru (Koramangala, Indiranagar, Whitefield, HSR Layout, Bellandur, BTM, etc.) as typical of Porter's core market.
2. **Browser Speech API**: In environments where browser Speech Recognition is unavailable (e.g. non-Chromium browsers without Web Speech support), the UI provides an instant text fallback input and 1-click test scenario runner so evaluators can test all conversational flows without interruption.
3. **Vehicle Pricing**: Base fares and vehicle capacities reflect standard Porter intra-city tiers (Tata Ace, 8ft Pickup, 14ft Canter, 2-Wheeler) based on volumetric weight calculations.
