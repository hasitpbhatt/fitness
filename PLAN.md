# Fitness × Freellm — Holistic Plan

> Status: living document. Updated 2026-10-20.
> Scope: `fitness.hasit.in` (meal estimates, daily logs, timezone-aware streaks) and the
> `freellm.hasit.in` gateway it depends on (vision routing, capabilities, billing).
> Rule: **nothing in this plan may be deployed without explicit per-deploy permission.**

---

## 1. North star

A person should be able to log a meal in under thirty seconds, trust the number enough to
keep using it, and never lose data because of a timezone, a race, or a bad model reply.

Two product promises drive every decision:

1. **Honest estimates, fast.** Ranges, not fake precision. Editable before saved.
2. **Your day is your day.** Midnight, streaks, and quota follow the user's clock, once
   confirmed, without corrupting history.

The gateway is leverage: fitness should never hard-code a model vendor. Freellm owns
routing, capability gating, quotas, and cost. Fitness owns the experience and the data.

---

## 2. The council lenses

Each reviewer defines a non-negotiable standard. Initiatives later in this document map
back to these.

| Lens | Standard | Concrete commitments |
| --- | --- | --- |
| **Don Norman** | Feedback, affordances, recovery | Show what the AI is doing; make every correction reversible before save; show quota before the user hits it; explain failures in human terms; one obvious next step in every phase. |
| **Steve Jobs** | Say no; make the default beautiful | One "Add meal" entry with photo or text; hide macros until review; no fake precision; concise copy; the happy path fits on one screen. |
| **Naval Ravikant** | Leverage and credibility | Own the model router (freellm), not the model; publish uncertainty; never store the photo; make correctness compound through trust. |
| **Linus Torvalds** | Correctness and boring operations | Atomic D1 writes, unique constraints, idempotency, no silent data loss, migrations that can be reasoned about, tests for every race we claim to have fixed. |
| **Peter Thiel** | A secret worth keeping | The moat is trust + privacy + model-agnostic routing, not "another calorie counter." Be contrarian: admit estimates are ranges, and make that a feature. |
| **Sundar Pichai** | Scale and reliability | Per-user and global cost caps, graceful degradation, observability, staged rollout, rollback that does not touch the shared database. |

---

## 3. Current state (verified)

### Fitness (production)

- Deployed app is the old pre-scan build (`850f076f`); `POST /api/fitness/scan` returns 404.
- `fitness_logs` has **2 rows**, no duplicate `(user_id, recorded_at, type)`.
- Migrations applied: only `0001_initial_fitness.sql`. `0002_fitness_profiles.sql`,
  `0003_scan_usage_and_unique_day.sql`, `0004_fitness_hardening.sql`,
  `0005_scan_ledger_and_welcome_slot.sql`, `0006_macro_targets.sql`, `0007_habits.sql`,
  `0008_measurements.sql`, and `0009_foods.sql` exist in source, apply cleanly locally,
  and are awaiting the remote window.
- `FREELLM_API_KEY` is **not set**. Only Google OAuth secrets exist.
- Source tree is green: `typecheck`, `lint`, `build`, `verify` 114/114.
- New UX exists locally: photo or text estimate, editable description + re-estimate,
  clarification questions, ranges, quota, manual fallback, timezone confirmation, macro
  targets/bars, editable/removable entries, yesterday logging/correction, a habit tracker
  with quick-add chips plus a 7-day strip, weight/waist/hips/arms history, and a seeded
  food database with portion scaling, manual entry, and AI food search options.

### Freellm (production)

- Deployed source `3eba708`; vision capability code is **not deployed**.
- Production upstream rows (Kilo): `nvidia/nemotron-3.5-super-vl:free` with
  `capabilities = "[]"`; `nvidia/nemotron-3-ultra-550b-a55b:free` with `NULL`.
- Alias slugs: `nemotron-3-5-super-vl` and `nemotron-3-ultra-550b-a55b`.
- Kilo key pool: 12 keys — 2 live, 1 slow, 1 down, 8 unknown. One recent TPM 429.
- Migration ledger shared with fitness + trx on D1 `hasit-in`
  (`ea3f54ed-75e6-4a45-b7b9-d80509efe4e8`). Ledger is at 0034 for freellm and
  `0001_initial_fitness.sql` for fitness. `0035` is unapplied.
- `tests`: 240 passing; typecheck/lint/build clean.

### Shared-database rules

- Both projects use the same D1 database and the same `d1_migrations` ledger.
- Never add or change `migrations_table` now: an empty ledger would replay every migration.
- Migration filenames must stay globally unique.
- `fitness_*` tables cascade from `freellm_users`; any future freellm rebuild of that table
  must be treated as a fitness-data risk.
- D1 time travel restores **all three apps**; it is not a per-app rollback tool.

---

## 4. Issue register

Severity: **P0** blocks deploy / data loss / security · **P1** likely user-visible bug or
significant risk · **P2** medium · **P3** polish. Status: `OPEN`, `NOW`, `NEXT`, `LATER`,
`ACCEPTED`. Completed work lives in the progress log.

### Freellm

| ID | Sev | Issue | Status |
| --- | --- | --- | --- |
| R-06 | P1 | Under-reserved vision requests can be delivered and then fail settlement for free. | **PARTIAL** (reserve is 3000/image; exact per-image metering still future) |

---

## 5. Remaining work

### 5.1 Hardening (next)

1. **Observability.** Count scan requests by phase/status/model, quota hits, p50/p95
   latency, token cost per scan, and upstream 429/5xx by provider/key.
2. **Cost guardrails.** Alert on daily AI spend; cap the shared token's aggregate burn;
   record image-token usage per request (finishes R-06).
3. **Shared-DB guardrails.** Document cascade risk; require a fitness-data check before
   any `freellm_users` rebuild; never restore D1 time travel casually.

### 5.2 Competitor parity (FitJam audit)

Source: local-only `ref_audit.md` (deliberately gitignored). Target: **at least parity
with every member-facing capability**, plus the admin/content tooling needed to operate
those features. The **only excluded cluster is payment integration** (pricing matrix,
checkout, EMI/countdown, money-back, finance/ERP). Sales/lead CRM is deferred unless we
run a paid coaching funnel; it is still tracked below, not silently dropped.

Already ahead of FitJam: Google OAuth instead of name+phone identity, public member
leaderboard, live AI estimate quota with refunds, server-side authorization, and no
admin UI shipped in the member bundle.

| ID | FitJam capability | Us today | Coverage plan |
| --- | --- | --- | --- |
| C-01 | Onboarding: goal, 20-zone timezone selector, push prompt | goal + auto timezone confirm; no push prompt or manual zone list | extend first-run onboarding; manual zone picker; notification opt-in (**P1**) |
| C-02 | Staff-provisioned access tiers (Inner Circle/Transform), trials, auto-revoke, deactivation copy | single tier; Google auth | admin-granted entitlements (`free`/`plus`/`coach`) + gated UI; no payments (**P1**) |
| C-03 | Pause/resume plan with a resume date | none | plan start/pause/resume + reminder (**P2**) |
| C-04 | Ask-a-doubt, personal member links, coach inbox/email | none | support form + email; tokenized personal links if coaching mode lands (**P2**) |
| C-05 | Workout library/categories + MP4/YouTube/Bunny player | none | categories, video player, admin authoring (**P1**) |
| C-06 | Scheduled plan/calendar: completed, locked, missed, today | daily logs only | assignments, day states, weekly calendar (**P1**) |
| C-07 | Two-part daily routine + 50% motivational interrupt + day-complete + notify coach | none | part 1/2 flow, mid-point card, day close-out, optional coach ping (**P2**) |
| C-08 | Content drops/unlock chains + progress percentage | none | release schedule, locked states, completion % (**P2**) |
| C-09 | Live classes: schedule, synced player, attendance, local time | none | schedule + attendance now; synced playback only if demand (**P3**) |
| C-10 | Workout comments/community | leaderboard + badges only | comments/cheers with moderation; keep the public leaderboard lead (**P2**) |
| C-11 | Fitness Reset education (Eat Smart / Move Smart) | none | curated video/article library with completion (**P3**) |
| C-12 | Measurements + weekly same-outfit photo compare | PARTIAL | weight/waist/hips/arms history DONE; private weekly photo compare pending private object storage |
| C-13 | PWA install page, offline shell, forced update | DONE | manifest + icons, `/install` page, offline app-shell cache, prompted service-worker updates |
| C-14 | Streaks, badges, daily loops, leaderboard | DONE | keep; add plan-adherence streaks when schedules land |
| C-15 | Macro targets + macro progress + editable entries + yesterday correction | DONE | protein/carb/fat targets, per-day bars, edit/remove, yesterday fix |
| C-16 | Indian food DB, manual search, portion scaling, brands | DONE | 62 seeded Indian/branded foods, search, portion scaling, manual nutrition entry |
| C-17 | AI food search returning options | DONE | option list with portions, quantity scaler, shares the scan quota |
| C-18 | AI photo scan + recalculate | DONE | keep; explicit "not counted" on failure (**DONE**) |
| C-19 | Habit tracker: water/protein/sleep/stretch, quick-add chips, 7-day strip | DONE | water/protein/sleep rollup, stretch quick-add, chips, 7-day strip |
| C-20 | Human food-photo review queue / community-approved DB | none | pending/approve/merge queue (**P3**) |
| C-21 | AI coach chat grounded in plan/progress, 20/day, clear | none | grounded chat, daily quota, clear, starter prompts (**P1**) |
| C-22 | AI usage meters + friendly exhaustion copy | scan quota DONE | extend meters to search/coach; shared copy (**P1**) |
| C-23 | Push + in-app popups + constant reminder banner + view counts | none | VAPID push, popups, admin banner, viewed tracking (**P1**) |
| C-24 | Notification admin: compose, schedule, audience, test, cancel | none | admin console + scheduled notifications (**P1**) |
| C-25 | Email lifecycle/campaigns/unsubscribe | none | welcome + weekly summary + unsubscribe; campaigns later (**P2**) |
| C-26 | Meal-plan viewer/delivery (in-app/PDF/WhatsApp) | none | in-app plan + PDF export; WhatsApp handoff optional (**P1**) |
| C-27 | Consultation slots, booking, reminders (no payment) | none | slots/booking/confirmation; no checkout (**P2**) |
| C-28 | Results/testimonials CMS + public result pages | none | public results + admin CRUD (**P3**) |
| C-29 | Per-route SEO, sitemap, structured data, prerender | SPA shell | route meta, sitemap, JSON-LD, prerender public pages (**P2**) |
| C-30 | Calorie/TDEE calculator lead magnet | none | public calculator + optional email capture (**P3**) |
| C-31 | Acquisition funnel, lead CRM, sales scripts, game-plan parser | none | defer unless we run paid coaching; no payment integration (**P3**) |
| C-32 | Admin/coach ops: members, grants, content, meal tracking, report cards, food review, calls | none | build the subset needed by C-02/05/06/07/20/23/24; rest with coaching mode (**P1/P2**) |
| C-33 | i18n | none | extract strings now; add Hindi after EN parity (**P3**) |
| C-34 | Health-platform sync (Apple Health/Google Fit) | none | native wrapper or Health Connect; PWA cannot; defer (**P3**) |
| C-35 | Haptics/micro-interactions/micro-wins | partial | haptics, reduced-motion paths, success micro-wins (**P3**) |
| C-36 | Terms, privacy, data export/delete, unsubscribe | none | legal pages + account export/delete (**P2**) |
| C-37 | Analytics/observability | basic logs only | funnel, scan reliability, quota, latency, cost, retention (**P1/P2**) |
| C-38 | Pricing/payment/finance/EMI/countdown/money-back | none | **EXCLUDED** — payment integration by instruction |
| C-39 | Security anti-patterns: name+phone identity, admin UI in public bundle | Google OAuth; server-side authz/admin | deliberately not copied; keep the stronger model (**DONE**) |

### 5.3 Parity sequence

1. **Deploy gate is clear.** Request deploy permission (runbook order), run live
   acceptance, then start parity Wave 1; land observability/cost guardrails alongside.
2. **Wave 1 — daily app:** C-13 PWA, C-14/C-19 habits, C-15 macros, C-12 measurements,
   C-16 food DB, C-17 AI search, C-23/C-24 notifications, C-21 coach, C-26 meal plan,
   C-32 minimal admin, C-01 onboarding, C-02 entitlements, C-37 baseline analytics.
3. **Wave 2 — training depth:** C-05/C-06/C-07/C-08 workouts/plans/routines/drops,
   C-32 content authoring, C-25 email, C-27 consultation, C-29 SEO, C-36 legal, C-03
   pause, C-04 support, C-10 comments.
4. **Wave 3 — scale:** C-09 live classes, C-11 education, C-20 food review, C-28 results
   CMS, C-30 calculator, C-33 i18n, C-34 health sync, C-35 haptics.
5. **Excluded / conditional:** C-38 payments; C-31 sales ops only if we launch a paid
   coaching funnel.

---

## 6. Deploy runbook (requires explicit permission)

Order matters. The shared D1 and the old live code make "migrate first, deploy second"
mandatory.

### 0. Preflight

- [ ] User grants permission for this specific deploy.
- [ ] `git`/tree status reviewed; no secrets in commits or docs.
- [ ] D1 duplicate check:
      `SELECT user_id, recorded_at, type, COUNT(*) FROM fitness_logs GROUP BY 1,2,3 HAVING COUNT(*) > 1;`
- [ ] Badge duplicate check:
      `SELECT user_id, badge_code, COUNT(*) FROM user_badges GROUP BY 1,2 HAVING COUNT(*) > 1;`
- [ ] Confirm exact vision row:
      `SELECT upstream_provider_id, upstream_model, capabilities FROM freellm_upstream_models WHERE upstream_model = 'nvidia/nemotron-3.5-super-vl:free';`
- [ ] All local checks green.

### 1. Freellm

1. Apply `0035_tag_vision_models.sql` remotely **before** deploying code:
   `npx wrangler d1 migrations apply hasit-in --remote`.
2. Postflight: capabilities for `nvidia/nemotron-3.5-super-vl:free` contain `vision`.
3. `npm run deploy` (build + Pages deploy).
4. Verify:
   - `/api/health` 200.
   - `/v1/models` shows `vision` for `nemotron-3-5-super-vl`.
   - Existing text chat still works.
   - A tiny image request routes successfully (or returns a clear error).
5. If vision fails, roll back the Pages deployment; the 0035 data change is harmless to
   old code, and text remains available.

### 2. Fitness

1. Set the server secret (use the `fl_` token with no connection binding; raw value is in
   the password manager — D1 stores only a hash):
   `npx wrangler pages secret put FREELLM_API_KEY --project-name fitness`.
2. Verify with `npx wrangler pages secret list --project-name fitness`.
3. Apply `0002_fitness_profiles.sql`, `0003_scan_usage_and_unique_day.sql`,
   `0004_fitness_hardening.sql`, `0005_scan_ledger_and_welcome_slot.sql`,
   `0006_macro_targets.sql`, `0007_habits.sql`, `0008_measurements.sql`, and
   `0009_foods.sql` remotely in a short window.
4. Verify tables/indexes/columns: `fitness_profiles` (+ macro target columns),
   `fitness_scan_usage`, `scan_data`, `fitness_scan_ledger`, `fitness_habits`,
   `fitness_measurements`, `fitness_foods`, macro columns on `fitness_logs`, partial
   `idx_fitness_logs_user_date_type`, `idx_user_badges_user_code`.
5. Deploy fitness.
6. Verify: logged-in `/api/fitness/log/today`, targets save/read, photo scan, text scan,
   re-estimate, log scan with macros, edit/delete, yesterday log, habit quick-adds and
   7-day rollup, measurement history, food search/portion logging, quota increments, 21st call 429, duplicate 409.

### 3. Live acceptance

- [ ] Photo → review → edit description → re-estimate → log.
- [ ] Text → questions → fill quantities → log.
- [ ] Manual + two scans = correct total, with macros.
- [ ] Macro targets save; today's bars reflect edits and scan totals.
- [ ] Edit/remove today's entry; log and repair yesterday's entry.
- [ ] Habit chips add water/protein/stretch; 7-day strip reflects them.
- [ ] Measurement save/update/delete persists and keeps omitted fields.
- [ ] Food search finds seeds/brands; portion scaling and manual entry add nutrition.
- [ ] AI food search returns options, scales the chosen portion, and spends one estimate.
- [ ] Quota 20, then 429; failed upstream refunds.
- [ ] Timezone confirmation re-dates once; no duplicate day/type.
- [ ] Admin/other user cannot touch this user's goals.
- [ ] Freellm vision gating: images rejected for text-only aliases and BYOK.

### Rollback

- Freellm: Pages rollback to `2e5e88d5` (source `3eba708`). Leave 0035.
- Vision-only issue: clear `vision` from the upstream row; text stays up.
- Fitness: Pages rollback to `850f076f`. Leave 0002-0009; old code ignores the ledger,
  macro columns, habits, measurements, and foods tables and still benefits from the
  welcome-row index exception.
- Never restore D1 time travel for a single app; it rolls back all three.

---

## 7. Test and acceptance matrix

| Area | Test | Gate |
| --- | --- | --- |
| Scan math | Manual 600 + scan 300 + scan 200 = 1100 | verify |
| Quota | 20 concurrent requests → 20×200, 5×429, count 20 | verify |
| Quota refund | Upstream 5xx → count unchanged; invalid input → no charge | verify |
| Quota day | Rotating tz hints cannot create a second budget | verify |
| Idempotency | Same `scan_id` twice -&gt; one row/entry | verify |
| Macros | Targets round-trip; scan + manual macros merge | verify |
| Corrections | Edit/delete entry; yesterday log; date window enforced | verify |
| Habits | Quick-add water/protein/stretch; 7-day rollup and targets | verify |
| Measurements | Upsert keeps omitted fields; history/delete; date window | verify |
| Foods | Seeded search, brands, portion math, manual add, merge into day | verify |
| AI food search | Option normalization, quota spend/refund, model prompt | verify |
| Ranges | `low ≤ calories ≤ high` after model output and manual edit | unit/verify |
| Timezone | IST/UTC+14/UTC−11/DST boundaries; backfill once | verify |
| Backfill failure | Profile stays unconfirmed; retry works | verify |
| Authz | Goal/badge/log isolation across users | verify |
| Vision gating | Image → text-only alias/BYOK → 400; mixed configs → vision only | freellm tests |
| Parser | Invalid role/part/budget → 400, not silent drop | freellm tests |
| Images | Scheme/MIME/private-host/detail rejected; size caps | freellm tests |
| Billing | Abort/under-reserve cannot deliver free content | freellm tests |
| Build | freellm + fitness build/typecheck/lint clean | CI/local |

---

## 8. Metrics and observability

- **Funnel:** capture → estimate → review → logged (drop-off per phase).
- **Estimate quality:** percentage of items edited, average absolute calorie correction,
  range width; use this to tune prompts — not to pretend precision.
- **Reliability:** scan success rate, 429/502/503 by cause, p50/p95 latency, timeout rate.
- **Cost:** tokens and credits per scan, image-token share, daily spend per user.
- **Trust:** timezone confirmations, quota hits, manual fallbacks, repeat usage.

Log model, status, latency, and token counts; never log images, descriptions, or secrets.

---

## 9. Decisions and open questions

| # | Decision | Proposed |
| --- | --- | --- |
| D-01 | Quota day before timezone confirmation | **Adopted:** UTC; confirmed profile timezone after. Prevents hint rotation. |
| D-02 | Aborted vision stream charge | **Adopted:** charge `max(flat rate, images × IMAGE_RESERVE_TOKENS)`; reserve is 3000/image. |
| D-03 | Allowed image URLs | **Adopted:** `data:image/(png|jpeg|webp|gif);base64` and public HTTPS only. |
| D-04 | Re-date history on later timezone changes | **Adopted:** no; re-date once at first confirmation. Keep copy exact. |
| D-05 | Invalid chat messages | **Adopted:** reject with a precise 400, never silently drop. |
| D-06 | Capability tagging | **Adopted:** migration seeds the known VL model; validated admin PATCH edits tags afterward. |
| D-07 | Older images in long chats | Show a "older images omitted" notice; never pretend they were sent. |
| D-08 | What undo reverses | **Adopted:** remove the meal's calories/scan entry; keep the day's check-in and streak. Undo is a correction, not an erasure. |

---

## 10. Definition of done

The first release is done when:

1. A new user can log a photo meal and a text meal end to end on production.
2. Corrected descriptions rebuild ingredients; totals are never lost.
3. The 21st estimate is blocked and failed estimates are refunded.
4. A timezone confirmation re-dates history exactly once and survives failure.
5. No user can touch another user's data or rotate quota.
6. Freellm only routes images to vision-capable configs and never silently drops
   message content.
7. Both builds, all tests, and the live acceptance list pass.
8. The plan is updated with what shipped, what was deferred, and why.
9. Competitor parity: every member-facing row in §5.2 is shipped or has an explicit
   deferred/conditional verdict; the only excluded cluster is payment integration.

---

## 11. Progress log

- **2026-10-19 — Phase 0 fitness:** fixed scan merge math (F-01), quota day keying and
  refund date (F-02/F-07), backfill-before-confirm (F-03), goal ownership (F-04),
  streak/badge races (F-05), scan-history cap (F-06). Added migration
  `0004_fitness_hardening.sql` (unique badge index) and applied it locally. Verify suite
  is **50/50**, including manual + two scans = 1100, goal IDOR, and quota-day tests.
- **2026-10-19 — Phase 0 freellm:** strict message parser with precise 400s (R-03),
  image URL/scheme/host/detail validation (R-04), bounded request body (R-05), attach
  race guard (R-10), client image type/size guards (R-11), sorted `/api/models`
  capabilities (R-12). **231/231 tests**, typecheck, lint, and build pass.
- **2026-10-19 — vision metering:** raised `IMAGE_RESERVE_TOKENS` to 3000 and made
  aborted vision streams charge `max(flat rate, images × reserve)` (R-06 partial,
  R-07). Freellm **233/233 tests**.
- **2026-10-19 — backfill edges:** collision rows now merge (sums/max/joined text,
  scan payloads deduped) instead of being skipped; quota rows re-key and merge; first
  confirmation always repairs even when the auto guess already matched, and later zone
  changes deliberately leave history alone (F-08/F-09). Fitness verify **54/54**.
- **2026-10-19 — experience pass:** pre-spend quota read + disabled estimate buttons
  (`GET /api/fitness/scan/quota`), per-scan undo (`POST /api/fitness/log/scan/undo`) in
  the dashboard toast and log page, and human 429/502/503/504 copy with a manual
  fallback (U-01–U-03). Fitness verify **58/58**.
- **2026-10-19 - effective capabilities/admin tagging:** `/api/models` and `/v1/models`
  now advertise `vision` only when a live key and non-cooling, enabled upstream can serve
  it; alias `capabilities` stays additive metadata. `aliasSupportsVision` and
  `configServesNow` have regression tests. Admins can PATCH validated capabilities on
  upstream models and edit tags inline; copy-models preserves tags (and now actually
  finds models from sibling providers). Freellm **236/236 tests**, typecheck, lint,
  build pass.
- **2026-10-19 - 0035 migration test:** seeded null, existing-array, already-tagged,
  and invalid-capability rows; applying 0035 tags only the VL row, is idempotent, and
  leaves other models untouched (R-16).
- **2026-10-19 - mocked scan coverage:** a second Miniflare instance mocks freellm's
  `/chat/completions` and proves the full pipeline: photo → vision model, refine → text
  model, text estimate with questions, invalid output/429 refunds, daily ceiling blocks
  before any upstream call, and scan → log → undo. Fitness verify **69/69**.
- **2026-10-19 - security pass:** session cookies now carry `Secure`; Google OAuth
  binds state to a one-time nonce cookie, rejects mismatches without burning the state,
  and clears both cookies. Verify covers start → mismatch → success → replay and asserts
  cookie flags. Fitness verify **75/75**.
- **2026-10-19 - `/v1` rate limits:** chat completions now allow 60/min per user and
  600/min globally, returning OpenAI-style `rate_limit_error` with `Retry-After`.
  Added KV limiter regression tests. Freellm **239/239 tests**, typecheck, lint, build
  pass.
- **2026-10-19 - key-level retry:** a 429 now retries the next key on the same config
  before failing over to another config, for streaming and non-streaming calls. Added a
  two-key regression test. Freellm **240/240 tests**, typecheck, lint, build pass.
- **2026-10-20 - empty-result and 409 recovery:** a zero-item estimate with clarification
  questions now opens review instead of an error screen, keeping the questions and
  re-estimate path visible; duplicate manual logs link straight to the dashboard.
  Fitness typecheck/lint/build pass (lint warnings pre-existing).
- **2026-10-20 - FitJam parity audit:** mapped every member-facing FitJam capability from
  `ref_audit.md` into §5.2 (`C-01`–`C-39`), including onboarding, plan tiers, workouts,
  measurements/photos, PWA, macros/food DB, habits, AI coach, notifications, meal plans,
  admin/coach tooling, SEO, i18n, and health sync. Payment/pricing/finance is the only
  excluded cluster; sales CRM is deferred unless coaching launches.
- **2026-10-20 - older-image notice:** `toWireMessages` moved to `src/lib/chat.ts`, keeps
  the newest 8 images, and reports how many older ones were left out. Chat now shows an
  explicit warning (with the text-history reassurance) instead of silently omitting them.
  Added two unit tests. Freellm **242/242 tests**, typecheck, lint, build pass.
- **2026-10-20 - bounded non-stream failover:** `/v1/chat/completions` now gives a
  non-streaming request a 50s total deadline, shared across every provider/key attempt and
  the streaming-to-JSON fallback. That leaves 10s of headroom inside fitness's 60s abort,
  so the client no longer gives up while freellm is still retrying. Added a two-config
  regression test proving the second config is never dialed after the deadline. Freellm
  **243/243 tests**, typecheck, lint, build pass.
- **2026-10-20 - scan idempotency and welcome slot:** added migration
  `0005_scan_ledger_and_welcome_slot.sql` with a per-user `fitness_scan_ledger` and a
  partial unique index that exempts the welcome row. Logging a scan now writes the log and
  ledger in one D1 batch; a retry after local midnight returns the original `log_id`
  instead of adding a second meal, and undo clears the ledger so a corrected re-log works.
  Verify covers both edges. Fitness **80/80 checks**, typecheck, lint, build pass.
- **2026-10-20 - PWA shell (C-13):** added a root-scoped manifest, 192/512/maskable icons,
  Apple touch icon/theme metadata, and a `/install` page with the native install prompt
  plus iOS/Android/desktop fallback instructions. A service worker caches the app shell,
  serves `/` for offline navigations, skips `/api`, and checks for a new worker hourly
  and on tab focus. A prompted in-app update banner reloads into the waiting worker.
  Typecheck/lint/build pass; manifest JSON and service-worker syntax validate.
- **2026-10-20 - macros and corrections (C-15):** added migration
  `0006_macro_targets.sql` (per-log protein/carbs/fat, per-profile daily targets). Scan
  logs now store and merge macros alongside calories. Added `GET`/`PUT
  /api/fitness/targets`, `PATCH`/`DELETE /api/fitness/log/:id`, a 7-day correction window
  for `date`/`recorded_at`, and target columns in `/api/fitness/log/today`. The dashboard
  shows calories/protein/carbs/fat bars with a target editor and per-entry edit/delete;
  the log page supports Today/Yesterday, macro entry, and a yesterday entry list.
  Fitness **87/87 checks**, typecheck, lint, build pass.
- **2026-10-20 - habit tracker (C-19):** added `0007_habits.sql` plus
  `GET /api/fitness/habits` and `POST /api/fitness/habits/quick`. Water and protein
  quick-adds increment the day's log (inserting one when absent); stretch lives in
  `fitness_habits`; sleep is derived from the day's sleep log. The dashboard shows
  water/protein/sleep/stretch with targets and a 7-day strip, water/protein/stretch
  one-tap chips, and a sleep deep-link. Fitness **94/94 checks**, typecheck, lint, build
  pass.
- **2026-10-20 - measurements (C-12, partial):** added `0008_measurements.sql` and
  owner-scoped `GET`/`POST`/`DELETE /api/fitness/measurements`. One row per local day
  supports weight, waist, hips, arms, and a note; partial saves preserve omitted fields,
  dates allow a 365-day backfill, and future dates are rejected. Added a `/measurements`
  page with latest-weight/change cards, a save/update form, and editable/deletable
  history, plus desktop/mobile navigation. Fitness **102/102 checks**, typecheck, lint,
  build pass. The weekly same-outfit photo comparison is still pending private object
  storage (R2) and is not included in the current deploy.
- **2026-10-20 - food database (C-16):** added `0009_foods.sql` with 62 seeded Indian
  dishes and branded foods, per-100g macros, default portions, and labels. Added
  owner-scoped food search (name/brand/category) and food logging with portion scaling;
  manual nutrition entry merges into the day's nutrition row. Added a `/foods` page with
  search, a scaled-nutrition panel, and manual entry, plus desktop/mobile navigation.
  Fitness **111/111 checks**, typecheck, lint, build pass.
- **2026-10-20 - AI food search (C-17):** added `POST /api/fitness/scan/suggest`, which
  asks the text model for 3-5 portion-aware food options and shares the daily scan
  quota. The `/foods` page can switch between database and AI results, then scale the
  chosen option before logging it as a manual nutrition entry. Invalid queries are
  rejected, failed upstream calls refund the quota, and an unconfigured gateway returns
  503. Fitness **114/114 checks**, typecheck, lint, build pass.
- **Next:** deploy remains pending explicit approval. Parity Wave 1 continues with
  C-23/C-24 notifications next; C-12 photo compare waits on private storage approval.
  Land observability/cost guardrails alongside.

## 12. Working agreement

- Update this file whenever a finding is fixed, deferred, or discovered.
- Deploy only with explicit permission, in the runbook order.
- Prefer a boring, tested fix over a clever one.
- Keep the photo private, the range honest, and the next step obvious.
