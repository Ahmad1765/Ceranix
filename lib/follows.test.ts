import { describe, it, expect, beforeEach, vi } from 'vitest';

// The supabase client is mocked at the module boundary so these tests assert the
// query this module BUILDS — the range window in particular — rather than any
// network behaviour. Each mock records the calls it received and returns the
// rows the test stages.
const calls: { table: string; select: string; eq: [string, string]; range: [number, number] }[] = [];
let edgeRows: any[] = [];
let profileRows: any[] = [];

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from(table: string) {
        const record: any = { table };
        const builder: any = {
          select(sel: string) {
            record.select = sel;
            return builder;
          },
          eq(col: string, val: string) {
            record.eq = [col, val];
            return builder;
          },
          order() {
            return builder;
          },
          range(from: number, to: number) {
            record.range = [from, to];
            calls.push(record);
            return Promise.resolve({ data: edgeRows, error: null });
          },
          in() {
            calls.push(record);
            return Promise.resolve({ data: profileRows, error: null });
          },
        };
        return builder;
      },
    },
  };
});

const { fetchFollowers, fetchFollowing, FOLLOW_PAGE_SIZE } = await import('@/lib/follows');

function profile(id: string) {
  return {
    id,
    username: `u${id}`,
    full_name: `User ${id}`,
    avatar_url: null,
    is_verified: false,
    followers_count: 0,
  };
}

beforeEach(() => {
  calls.length = 0;
  edgeRows = [];
  profileRows = [];
});

describe('follow list paging', () => {
  it('page 0 requests exactly the first FOLLOW_PAGE_SIZE rows', async () => {
    await fetchFollowers('me');
    expect(calls[0].range).toEqual([0, FOLLOW_PAGE_SIZE - 1]);
  });

  it('page N requests a non-overlapping window of the same size', async () => {
    await fetchFollowers('me', 2);
    const [from, to] = calls[0].range;
    expect(from).toBe(2 * FOLLOW_PAGE_SIZE);
    expect(to - from + 1).toBe(FOLLOW_PAGE_SIZE);
  });

  it('honours an explicit page size', async () => {
    await fetchFollowers('me', 1, 10);
    expect(calls[0].range).toEqual([10, 19]);
  });

  it('followers matches on followee_id and selects follower_id', async () => {
    await fetchFollowers('me');
    expect(calls[0].eq).toEqual(['followee_id', 'me']);
    expect(calls[0].select).toContain('follower_id');
  });

  it('following matches on follower_id and selects followee_id', async () => {
    await fetchFollowing('me');
    expect(calls[0].eq).toEqual(['follower_id', 'me']);
    expect(calls[0].select).toContain('followee_id');
  });

  it('preserves the newest-first edge order after the profile join', async () => {
    // The profile lookup uses `.in()`, which returns rows in arbitrary order —
    // fetchProfilesByIds has to restore the edge ordering.
    edgeRows = [{ follower_id: 'c' }, { follower_id: 'a' }, { follower_id: 'b' }];
    profileRows = [profile('a'), profile('b'), profile('c')];
    const rows = await fetchFollowers('me');
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops edges whose profile is missing rather than emitting holes', async () => {
    edgeRows = [{ follower_id: 'a' }, { follower_id: 'ghost' }];
    profileRows = [profile('a')];
    const rows = await fetchFollowers('me');
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('skips the profile round-trip entirely when a page is empty', async () => {
    edgeRows = [];
    const rows = await fetchFollowing('me', 5);
    expect(rows).toEqual([]);
    // Only the edge query ran — an empty `.in()` would match every profile.
    expect(calls).toHaveLength(1);
  });
});
