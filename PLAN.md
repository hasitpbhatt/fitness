# Fitness × Freellm — Holistic Plan

> Status: living document. Updated 2026-10-19.
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
- Migrations applied: only `0001_initial_fitness.sql`. `0002_fitness_profiles.sql` and
  `0003_scan_usage_and_unique_day.sql` are **not applied**. `0004_fitness_hardening.sql`
  exists in source and is applied locally; it is also awaiting the remote window.
- `FREELLM_API_KEY` is **not set**. Only Google OAuth secrets exist.
- Source tree is green: `typecheck`, `lint`, `build`, `verify` 75/75.
- New UX exists locally: photo or text estimate, editable description + re-estimate,
  clarification questions, ranges, quota, manual fallback, timezone confirmation.

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

### Fitness

| ID | Sev | Issue | Status |
| --- | --- | --- | --- |
| F-10 | P3 | Cross-midnight retry with the same `scan_id` can log twice (only today's row is checked). | **OPEN** (needs a scan ledger) |
| F-11 | P3 | Signup welcome row can consume the user's `custom` slot on the same UTC day. | **OPEN** |

### Freellm

| ID | Sev | Issue | Status |
| --- | --- | --- | --- |
| R-06 | P1 | Under-reserved vision requests can be delivered and then fail settlement for free. | **PARTIAL** (reserve is 3000/image; exact per-image metering still future) |
| R-15 | P3 | Upstream 30s timeout + non-stream fallback can approach fitness's 60s abort. | **OPEN** |
| R-17 | P3 | `toWireMessages` drops older images silently. | **OPEN** (D-07) |

---

## 5. Remaining work

### Reliability and leverage

1. **Timeout budget (R-15).** Align upstream and fitness timeouts; consider streaming for
   scans or a shorter max token budget.
2. **Older images (R-17, D-07).** Show an "older images omitted" notice; never pretend
   they were sent.
3. **Cross-midnight retry (F-10).** Add a scan ledger so a retried `scan_id` cannot log
   twice after midnight.
4. **Welcome slot (F-11).** Keep the signup welcome row from consuming the same day's
   `custom` slot.
5. **Observability.** Count scan requests by phase/status/model, quota hits, p50/p95
   latency, token cost per scan, and upstream 429/5xx by provider/key.
6. **Cost guardrails.** Alert on daily AI spend; cap the shared token's aggregate burn;
   record image-token usage per request (finishes R-06).
7. **Shared-DB guardrails.** Document cascade risk; require a fitness-data check before
   any `freellm_users` rebuild; never restore D1 time travel casually.

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
3. Apply `0002_fitness_profiles.sql`, `0003_scan_usage_and_unique_day.sql`, and
   `0004_fitness_hardening.sql` remotely in a short window.
4. Verify tables/indexes: `fitness_profiles`, `fitness_scan_usage`, `scan_data`,
   `idx_fitness_logs_user_date_type`, `idx_user_badges_user_code`.
5. Deploy fitness.
6. Verify: logged-in `/api/fitness/log/today`, photo scan, text scan, re-estimate,
   log scan, quota increments, 21st call 429, duplicate 409.

### 3. Live acceptance

- [ ] Photo → review → edit description → re-estimate → log.
- [ ] Text → questions → fill quantities → log.
- [ ] Manual + two scans = correct total.
- [ ] Quota 20, then 429; failed upstream refunds.
- [ ] Timezone confirmation re-dates once; no duplicate day/type.
- [ ] Admin/other user cannot touch this user's goals.
- [ ] Freellm vision gating: images rejected for text-only aliases and BYOK.

### Rollback

- Freellm: Pages rollback to `2e5e88d5` (source `3eba708`). Leave 0035.
- Vision-only issue: clear `vision` from the upstream row; text stays up.
- Fitness: Pages rollback to `850f076f`. Leave 0002–0004; old code ignores them.
- Never restore D1 time travel for a single app; it rolls back all three.

---

## 7. Test and acceptance matrix

| Area | Test | Gate |
| --- | --- | --- |
| Scan math | Manual 600 + scan 300 + scan 200 = 1100 | verify |
| Quota | 20 concurrent requests → 20×200, 5×429, count 20 | verify |
| Quota refund | Upstream 5xx → count unchanged; invalid input → no charge | verify |
| Quota day | Rotating tz hints cannot create a second budget | verify |
| Idempotency | Same `scan_id` twice → one row/entry | verify |
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
- **2026-10-19 - empty-result and 409 recovery:** a zero-item estimate with clarification
  questions now opens review instead of an error screen, keeping the questions and
  re-estimate path visible; duplicate manual logs link straight to the dashboard.
  Fitness typecheck/lint/build pass (lint warnings pre-existing).
- **Next:** finish the remaining P3 work (R-15, R-17, F-10/F-11), then request deploy
  permission (runbook order) and run live acceptance.

## 12. Working agreement

- Update this file whenever a finding is fixed, deferred, or discovered.
- Deploy only with explicit permission, in the runbook order.
- Prefer a boring, tested fix over a clever one.
- Keep the photo private, the range honest, and the next step obvious.
