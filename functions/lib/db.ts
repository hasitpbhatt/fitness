// Database helper — D1 wrapper for fitness operations

import type { D1Database, D1Result } from '@cloudflare/workers-types'

export async function prepareFind(db: D1Database, sql: string, params?: unknown[]): Promise<D1Result<Record<string, unknown>>['results']> {
  const result = await db.prepare(sql).bind(...(params ?? [])).all()
  return result.results
}

export async function prepareFirst(db: D1Database, sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
  const row = await db.prepare(sql).bind(...(params ?? [])).first()
  return row as Record<string, unknown> | null
}

export async function batchExecute(
  db: D1Database,
  statements: { sql: string; params?: unknown[] }[]
): Promise<D1Result<unknown>[] | null> {
  if (statements.length === 0) return null
  return db.batch(
    statements.map((stmt) =>
      db.prepare(stmt.sql).bind(...(stmt.params ?? []))
    )
  )
}