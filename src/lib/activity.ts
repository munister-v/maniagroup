import { q } from "./pg";

/**
 * Unified admin activity log. Every meaningful operation (import, export, bulk
 * save, delete, backup, login) drops one row here so the Monitoring section can
 * show a single chronological feed instead of state scattered across
 * sync_meta, stock_movements and nowhere-at-all (exports were previously
 * invisible). Logging is best-effort — a logging failure must never break the
 * actual operation, so callers fire-and-forget and we swallow errors.
 */

export type ActivityAction =
  | "import" | "export" | "save" | "delete" | "backup"
  | "login" | "login_fail" | "photos" | "settings";

export type ActivityRow = {
  id: string;
  action: ActivityAction;
  summary: string;
  count: number | null;
  author: string;
  created_at: string;
};

const KEEP_ROWS = 500;

export async function logActivity(action: ActivityAction, summary: string, count?: number, author = "admin"): Promise<void> {
  try {
    await q(
      "INSERT INTO admin_activity (action, summary, count, author) VALUES ($1, $2, $3, $4)",
      [action, summary.slice(0, 500), count ?? null, author],
    );
    // Cheap bounded retention: prune only occasionally (~1 in 20 writes) so the
    // table can't grow unbounded but we don't run a DELETE on every log call.
    if (Math.random() < 0.05) {
      await q(
        `DELETE FROM admin_activity WHERE id < (
           SELECT COALESCE(MIN(id), 0) FROM (
             SELECT id FROM admin_activity ORDER BY id DESC LIMIT $1
           ) keep
         )`,
        [KEEP_ROWS],
      );
    }
  } catch {
    /* logging is best-effort */
  }
}

export async function recentActivity(limit = 40): Promise<ActivityRow[]> {
  return q<ActivityRow>(
    "SELECT id::text, action, summary, count, author, created_at::text FROM admin_activity ORDER BY id DESC LIMIT $1",
    [Math.min(200, Math.max(1, limit))],
  );
}
