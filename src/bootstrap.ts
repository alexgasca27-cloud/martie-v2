import worker from './index-v2';

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
}

let schemaPromise: Promise<void> | null = null;

function ensureOperationalSchema(env: Env) {
  if (!env.DB) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB!.prepare(`CREATE TABLE IF NOT EXISTS birthday_rewards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        redeemed_at TEXT NOT NULL,
        UNIQUE(user_id, year),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )`).run();

      const info = await env.DB!.prepare('PRAGMA table_info(orders)').all<any>();
      const columns = new Set((info.results || []).map((x: any) => String(x.name)));
      const alter = async (sql: string) => {
        try { await env.DB!.prepare(sql).run(); }
        catch (error: any) {
          if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
        }
      };
      if (!columns.has('source')) await alter("ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'app'");
      if (!columns.has('created_by')) await alter('ALTER TABLE orders ADD COLUMN created_by TEXT');
      await env.DB!.prepare('CREATE INDEX IF NOT EXISTS idx_orders_source_created ON orders(source,created_at)').run();
      await env.DB!.prepare('CREATE INDEX IF NOT EXISTS idx_birthday_rewards_user ON birthday_rewards(user_id,year)').run();
    })().catch(error => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.DB) await ensureOperationalSchema(env);
    return worker.fetch(request, env);
  }
};
