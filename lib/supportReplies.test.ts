import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { SUPPORT_BOT_REPLIES } from '@/lib/supportReplies';

// dispatch_support_bot_reply only accepts texts stored in support_bot_replies.
// If a reply changes here without a migration upserting it, the bot goes silent.
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

// Same escaping the migration uses: E'' literal, newlines as \n.
const sqlLiteral = (s: string) =>
  "E'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";

describe('support bot replies', () => {
  it('has unique keys and texts', () => {
    expect(new Set(SUPPORT_BOT_REPLIES.map((r) => r.key)).size).toBe(SUPPORT_BOT_REPLIES.length);
    expect(new Set(SUPPORT_BOT_REPLIES.map((r) => r.content)).size).toBe(SUPPORT_BOT_REPLIES.length);
  });

  it.each(SUPPORT_BOT_REPLIES)('$key is seeded in a migration', ({ content }) => {
    expect(migrations).toContain(sqlLiteral(content));
  });
});
