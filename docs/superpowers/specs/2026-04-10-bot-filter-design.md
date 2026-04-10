# Bilibili Lucky Draw Bot Filter Design

## Overview

This document defines a configurable anti-bot / lottery-account verification system for `bilibili-lucky`.

The goal is to improve draw fairness by reviewing a candidate account after it is selected and before it is finalized as a winner. The system evaluates user level, recent space dynamics, repost-heavy behavior, lottery-keyword density, and privacy visibility to decide whether the candidate should pass verification.

The design prioritizes:

- configurable thresholds in the UI
- low request volume compared with pre-screening the entire pool
- compatibility with the existing Bilibili proxy and WBI signing flow
- exportable audit data so draw results remain explainable

## Product Decision

The accepted product direction is:

- verification mode: verify-on-draw
- configuration surface: exposed in the UI with user-adjustable thresholds
- automation behavior: failed verification triggers automatic redraw
- retry guard: stop after a configurable maximum retry count

This replaces pre-screening the whole candidate pool. Pre-screening was considered but rejected because it would dramatically increase API requests and the likelihood of triggering Bilibili rate limits.

## User Flow

1. User loads comments and applies the existing basic filters.
2. User starts the draw from the filtered candidate pool.
3. When the user locks the current candidate, the app enters a verification step before finalizing the winner.
4. The app fetches recent space dynamics for the selected candidate.
5. The app computes a verification result using the configured thresholds.
6. If the candidate passes, the user is finalized as a winner.
7. If the candidate fails, the app records the failure reason, excludes the candidate from the current draw session, and automatically redraws.
8. If the app reaches the retry limit, it stops and asks the user to relax the thresholds or disable bot filtering.

## Scope

### In Scope

- add a bot-filter configuration panel to the existing draw UI
- fetch recent user dynamics through the server-side proxy
- evaluate candidates at lock time only
- automatically skip failed candidates and redraw
- persist filter configuration locally in the browser
- log verification activity in the session log
- export verification snapshots alongside draw results

### Out of Scope

- pre-screening the full candidate pool before the draw
- permanent account blacklists or reputation storage across sessions
- admin dashboards for reviewing skipped candidates
- ML-based classification or external anti-spam services

## UX Design

### Configuration UI

Add a "Bot Filter" section inside the existing configuration card in `/Users/movecall/Documents/code/web/bilibili-lucky/src/App.tsx`.

Controls:

- `enableBotFilter`: boolean, default `true`
- `minLevel`: integer, default `3`
- `forwardRatioLimit`: float, default `0.8`
- `keywordRatioLimit`: float, default `0.6`
- `retryLimit`: integer, default `30`
- `privatePolicy`: enum `reject | allow`, default `reject`
- `dynamicSampleSize`: integer, default `20`

Presentation:

- show the enable toggle in the main row
- show common options inline
- place advanced thresholds in an expandable subsection if the card becomes too dense
- explain that stricter thresholds reduce bot risk but can increase false positives

### Draw State UX

Add a verification sub-state after the user clicks "lock current result":

- show a temporary verification status such as `正在审核账号真实性`
- disable repeated clicks while verification is running
- if the candidate fails, show a concise reason in the stage status and logger, then continue redraw automatically
- if verification errors out, allow the draw to continue with a warning rather than hard-failing the entire session

### Logging

Each verification attempt should log:

- candidate UID and username
- whether dynamics were visible
- the computed metrics
- pass/fail result
- reason codes for a failed review
- current retry count when automatic redraw happens

## Architecture

### Server Layer

Reuse the existing Bilibili proxy stack in `/Users/movecall/Documents/code/web/bilibili-lucky/server/biliProxy.js`.

Extend the proxy to support a new request type:

- `type=spaceDynamic`

Server responsibilities:

- fetch recent user space dynamics from `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space`
- reuse the existing WBI signing flow and headers/Cookie behavior
- normalize the upstream response to a frontend-friendly shape
- add a randomized delay of roughly 500-1000ms before upstream dynamic requests to reduce request burstiness
- return structured error states so the frontend can distinguish "private / unavailable" from generic request failure when possible

### Frontend Layer

Introduce the following modules:

- `/Users/movecall/Documents/code/web/bilibili-lucky/src/services/botFilterService.ts`
  - requests user dynamics through `/api/proxy`
  - converts raw payloads into normalized dynamic items
- `/Users/movecall/Documents/code/web/bilibili-lucky/src/utils/botScoring.ts`
  - pure scoring and decision logic
- optional local state helpers or hooks if `/Users/movecall/Documents/code/web/bilibili-lucky/src/App.tsx` becomes too large

### State Model

New state required in the app:

- `botFilterConfig`
- `isReviewingCandidate`
- `reviewAttempts`
- `skippedCandidates`
- `currentReviewResult`
- per-winner verification snapshot stored alongside the winner entry or in a parallel audit structure

Persist `botFilterConfig` in `localStorage` so the user keeps their preferred thresholds between sessions.

## Data Model

### BotFilterConfig

```ts
interface BotFilterConfig {
  enabled: boolean;
  minLevel: number;
  forwardRatioLimit: number;
  keywordRatioLimit: number;
  retryLimit: number;
  privatePolicy: 'reject' | 'allow';
  dynamicSampleSize: number;
}
```

### UserDynamicItem

```ts
interface UserDynamicItem {
  id: string;
  type: string;
  text: string;
  createdAt: number;
}
```

### BotReviewMetrics

```ts
interface BotReviewMetrics {
  level: number;
  dynamicCount: number;
  forwardRatio: number;
  keywordRatio: number;
  burstCount: number;
  privateDynamics: boolean;
}
```

### BotReviewResult

```ts
interface BotReviewResult {
  passed: boolean;
  score: number;
  reasonCodes: string[];
  metrics: BotReviewMetrics;
}
```

### SkippedCandidateRecord

```ts
interface SkippedCandidateRecord {
  mid: string;
  uname: string;
  skippedAt: string;
  reviewResult: BotReviewResult;
}
```

## Verification Logic

### Hard Fail Conditions

Immediately fail verification when either of these is true:

- candidate level is below `minLevel`
- dynamics are not visible and `privatePolicy === 'reject'`

### Scoring Inputs

Inspect up to `dynamicSampleSize` recent items.

Metrics:

- `forwardRatio = repostCount / dynamicCount`
- `keywordRatio = lotteryKeywordCount / dynamicCount`
- `burstCount = count of suspicious clustered repost activity in a short time window`

Initial keyword dictionary:

- `互动抽奖`
- `抽奖`
- `中奖`
- `开奖`
- `转发抽奖`
- `平台开奖`
- `抽个`
- `打钱`

### Decision Rule

Use a weighted score with the following initial priorities:

- dynamic-content behavior: 60%
- account baseline weight: 30%
- privacy handling: governed by `privatePolicy`

Recommended initial behavior:

- hard fail conditions immediately return `passed = false`
- otherwise compute a score from `0-100`
- use `score >= 60` as the first high-risk threshold

The scoring implementation should remain simple and explicit rather than opaque. The first release should prefer deterministic rules over a complicated model.

## Error Handling

### Dynamic Request Failure

If the dynamic request fails because of transient network or upstream issues:

- do not abort the full draw session
- log a warning
- treat the candidate as passed for this attempt

Rationale: request instability should not make the main raffle unusable.

### Retry Limit

If automatic redraw reaches `retryLimit`:

- stop verification-driven redraw
- keep the draw session active
- show a clear message asking the user to relax thresholds or disable bot filtering

### Duplicate Failed Candidates

Failed candidates must be excluded from the remainder of the active draw session to avoid repeated review loops.

## Export / Audit Requirements

The existing export payload must be extended so it remains reproducible and trustworthy.

Export data should include:

- bot filter config snapshot used for each winner review
- per-winner `BotReviewResult`
- skipped candidate summary
- total verification attempts
- failure reasons by count

The export must continue using draw-time snapshots rather than mutable current UI state.

## Testing Strategy

### Unit Tests

Add unit coverage for:

- scoring logic in `botScoring.ts`
- hard-fail behavior for low-level accounts
- private-dynamics handling under both `reject` and `allow`
- keyword ratio and forward ratio threshold behavior
- retry-stop behavior around the configured limit

### Integration / Flow Tests

Add targeted tests for:

- proxy `spaceDynamic` requests and response normalization
- draw flow where the first candidate fails and the second candidate passes
- export payload including verification snapshots and skipped candidate audit data

### Regression Priority

Preserve the existing export-snapshot regression fix so draw audit data always reflects the actual draw-time configuration.

## Implementation Plan Outline

1. Add normalized server proxy support for `spaceDynamic`.
2. Add frontend bot filter service and scoring utility.
3. Add config state and local persistence.
4. Update draw lock flow to run verification before finalizing a winner.
5. Add skipped-candidate tracking and retry-limit handling.
6. Extend export payload with verification audit data.
7. Add tests for scoring, redraw, and export behavior.

## Risks and Mitigations

### Risk: Bilibili anti-crawl pressure

Mitigation:

- verify on draw only
- keep sample size bounded
- add randomized server delay
- reuse Cookie-enabled authenticated requests when available

### Risk: False positives

Mitigation:

- expose thresholds in the UI
- use conservative defaults
- log explicit failure reasons
- allow users to disable the filter

### Risk: App state complexity in `App.tsx`

Mitigation:

- isolate scoring logic into pure utilities
- isolate API logic into a dedicated service
- extract local hooks/helpers if the draw-flow code becomes too hard to follow

## Open Decisions Resolved

These decisions are now fixed for implementation:

- use verify-on-draw instead of pre-screening
- expose thresholds in the UI
- persist filter settings locally
- use automatic redraw on failed verification
- allow transient verification request failures to degrade gracefully instead of blocking the raffle
