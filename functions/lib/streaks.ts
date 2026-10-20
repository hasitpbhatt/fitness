// Daily streak + check-in bookkeeping, keyed by the user's local calendar date.

import { newId } from './crypto'
import { addDays, localDate } from './time'
import type { Bindings } from './types'

export async function updateStreaks(env: Bindings, userId: string, timezone: string | null): Promise<void> {
  const today = localDate(timezone)
  const yesterday = addDays(today, -1)

  const streak = await env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ?').bind(userId).first()

  const checkin = await env.DB.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?')
    .bind(userId, today)
    .first()

  let newStreak = 0
  let newLongest = (streak?.longest_streak as number) || 0

  if (checkin) {
    // Already checked in today.
    newStreak = (streak?.current_streak as number) || 0
    newLongest = Math.max(newLongest, newStreak)
  } else {
    const yesterdayCheckin = await env.DB.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?')
      .bind(userId, yesterday)
      .first()

    newStreak = yesterdayCheckin ? ((streak?.current_streak as number) || 0) + 1 : 1
    newLongest = Math.max(newLongest, newStreak)

    // Concurrent first-logs both reach this branch; the unique (user_id, date)
    // index lets exactly one insert win without turning the other log into an
    // error.
    await env.DB.prepare(
      'INSERT OR IGNORE INTO daily_checkins (id, user_id, date, points, created_at) VALUES (?, ?, ?, 10, ?)',
    )
      .bind(newId(), userId, today, Date.now())
      .run()
  }

  // Single atomic upsert: two concurrent first logs must not both take the
  // insert branch and turn one request into a primary-key error.
  await env.DB.prepare(
    `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_checkin, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       last_checkin = excluded.last_checkin,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, newStreak, newLongest, today, Date.now())
    .run()

  await awardStreakBadges(env, userId, newStreak)
}

async function awardStreakBadges(env: Bindings, userId: string, streak: number): Promise<void> {
  const badgeMap: Record<string, number> = {
    first_log: 1,
    streak_3: 3,
    streak_7: 7,
    streak_14: 14,
    streak_30: 30,
    streak_60: 60,
    streak_90: 90,
    streak_365: 365,
  }

  for (const [badgeCode, requiredStreak] of Object.entries(badgeMap)) {
    if (streak < requiredStreak) continue
    // The unique (user_id, badge_code) index makes duplicate awards a no-op.
    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_badges (id, user_id, badge_code, awarded_at) VALUES (?, ?, ?, ?)',
    )
      .bind(newId(), userId, badgeCode, Date.now())
      .run()
  }
}
