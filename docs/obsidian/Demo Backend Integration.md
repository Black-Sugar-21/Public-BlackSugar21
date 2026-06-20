---
tags: [web, angular, marketing, backend, coach]
---

# Demo Backend Integration

#web #angular #marketing

Back to [[_Index]]. Consumer: [[Coach Demo Widget]].

The demo widget calls public **Cloud Functions** (CoachFish) at `https://us-central1-black-sugar21.cloudfunctions.net/…` via plain `fetch` (no auth — anonymous). All requests are JSON POST and include `userLanguage` (one of the 13 coach languages) and `sessionId`.

## Endpoints (constants in `coach-widget.component.ts`)

| Const | Function | Purpose |
|---|---|---|
| `ENDPOINT` | `coachDemoChat` | Normal chat; can return places / phrases / needLocation. |
| `SIM_ENDPOINT` | `coachDemoSimulate` | Situation simulation (multi-approach). |
| `MV_ENDPOINT` | `coachDemoMultiverse` | Relationship multiverse (5 stages + compatibility). |
| `FB_ENDPOINT` | `coachDemoFeedback` | Per-reply 👍/👎 feedback (fail-open). |
| `PLACE_CLICK_ENDPOINT` | `coachDemoPlaceClick` | Logs a venue tap (fail-open, `keepalive`). |

## `coachDemoChat`

**Request**
```json
{ "message": "…", "lat": 0, "lng": 0, "city": "…",
  "userLanguage": "en", "history": [{"role":"user|coach","text":"…"}],
  "sessionId": "s_…", "exclude": ["venue names shown"], "excludePhrases": ["phrases shown"] }
```
`history` is the last 8 plain messages (no place/phrase attachments). `lat`/`lng` OR `city` are sent only for place queries.

**Response (any subset)**
```json
{ "reply": "text",
  "places": [{ "name":"", "address":"", "rating":4.5, "mapsUrl":"",
               "why":"", "perspectives":["…"], "score":87, "tip":"" }],
  "phrases": ["…"],
  "phraseMeta": [{ "perspective":"", "why":"" }],
  "needLocation": true,
  "exhausted": false,
  "limited": false,
  "appCta": false }
```
- `needLocation` → widget shows the city-input fallback.
- `exhausted` → widget clears its shown-set so results recycle next time.
- `limited` → per-IP/hour abuse backstop hit → logs `coach_demo_limited`.
- `appCta` (bool) → drives the app-store CTA funnel gate (Remote Config `coach_demo_app_cta`).

## `coachDemoSimulate` (situation)

**Request**: `{ situation, userLanguage, sessionId }`

**Response**
```json
{ "stage":"", "perspectiveNames":["…"], "perspectivesUsed":5,
  "approaches":[{ "toneKey":"direct|playful|romantic_vulnerable|…",
    "tone":"", "phrase":"", "why":"", "perspectives":["…"], "confidence":80 }],
  "limited": false }
```
Best approach = highest `confidence`. `confidence` (0-100) maps to 1-5 stars.

## `coachDemoMultiverse`

**Request**: `{ context, userLanguage, sessionId }`

**Response**
```json
{ "compatibilityScore":78, "compatibilityStars":4, "compatibilityLabel":"",
  "stages":[{ "stageId":"", "emoji":"", "label":"", "narrative":"",
    "bestPhrase":"", "score":8, "tip":"" }],
  "keyInsights":["…"], "limited": false }
```
Renders 5 relationship stages in a carousel + compatibility header + insights.

## `coachDemoFeedback`

**Request**: `{ rating:"up|down", intent:"general|place|phrase|simulate|multiverse", userLanguage, sessionId, question, answer }`. Fire-and-forget; UI shows "thanks" regardless.

## `coachDemoPlaceClick`

**Request**: `{ name, fit, perspectives, rank, userLanguage, sessionId }`. Sent with `keepalive` on Maps-link click; never blocks navigation.

## Notes

- All calls are wrapped so any failure shows a friendly retry message — the demo never hard-fails the UI.
- The 5 "perspectives" are the multi-agent psychology system surfaced from the core Coach (Gottman/attachment/etc.), exposed read-only in the demo.
