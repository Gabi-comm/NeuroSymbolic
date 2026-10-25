'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import Pagination, { pageRange } from '@/components/Pagination';

interface UserProfile {
  // The primary key. userloginuuid is null on older accounts, so it cannot
  // key the list or target an update.
  id: number;
  userloginuuid: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  user_type: string | null;
}

// Assigned here by an admin, never chosen at sign-up. Descriptive
// only: what an account may do is decided by role, not by this.
const USER_TYPES = ['Civilian', 'Reporter', 'Inspector'] as const;

const roleLabel = (role: string) => (role === 'admin' ? 'Admin' : 'User');

const FILTERS = ['All', ...USER_TYPES, 'Admin'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Narrow a UserDetail query to one filter. Reporter types only describe
 * non-admin accounts, and a null type is shown (and counted) as Civilian.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's generic type is unwieldy
function applyFilter<Q extends { eq: any; or: any }>(query: Q, filter: Filter): Q {
  if (filter === 'All') return query;
  if (filter === 'Admin') return query.eq('role', 'admin');
  const nonAdmin = query.or('role.is.null,role.neq.admin');
  return filter === 'Civilian'
    ? nonAdmin.or('user_type.is.null,user_type.eq.Civilian')
    : nonAdmin.eq('user_type', filter);
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  // Replaces confirm()/alert(). A native confirm cannot be styled, cannot be
  // dismissed with a click outside, and reads poorly to screen readers.
  const [pending, setPending] = useState<{ user: UserProfile; newRole: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<number | null>(null);

  // 5 accounts per page, fetched per filter; the chips carry the counts.
  const [filter, setFilter] = useState<Filter>('All');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<Filter, number>>>({});
  // Bumped after a role or type change: the account may now belong to
  // another filter, so the page and the counts are fetched again.
  const [reloadKey, setReloadKey] = useState(0);

  const adminCount = counts.Admin ?? 0;
  const accountCount = counts.All ?? 0;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentAdminId(user.id);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const results = await Promise.all(
        FILTERS.map((f) =>
          applyFilter(supabase.from('UserDetail').select('id', { count: 'exact', head: true }), f)
        )
      );
      if (isMounted) setCounts(Object.fromEntries(FILTERS.map((f, i) => [f, results[i].count ?? 0])));
    })();
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const [from, to] = pageRange(page);
        const { data, error, count } = await applyFilter(
          supabase.from('UserDetail').select('*', { count: 'exact' }),
          filter
        )
          .order('username', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (error) throw error;
        if (!isMounted) return;
        // A change can empty the last page; step back to the one before it.
        if ((data ?? []).length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setUsers(data ?? []);
        setTotal(count ?? 0);
      } catch (err) {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Could not load users.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [filter, page, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const applyRoleChange = async () => {
    if (!pending) return;
    const { user, newRole } = pending;
    setActionError(null);

    // Server-side guard is the RLS policy; this only prevents the obvious mistake.
    if (user.userloginuuid === currentAdminId) {
      setActionError('You cannot change your own admin access.');
      setPending(null);
      return;
    }

    const { error } = await supabase
      .from('UserDetail')
      .update({ role: newRole })
      .eq('id', user.id);

    if (error) {
      setActionError(`Could not update the role: ${error.message}`);
    } else {
      reload();
    }
    setPending(null);
  };

  const applyUserType = async (user: UserProfile, userType: string) => {
    setActionError(null);
    setSavingType(user.id);
    const { error } = await supabase
      .from('UserDetail')
      .update({ user_type: userType })
      .eq('id', user.id);
    if (error) {
      setActionError(`Could not update the reporter type: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, user_type: userType } : u
        )
      );
      reload();
    }
    setSavingType(null);
  };

  return (
    <div className="min-h-screen">
      {/* Console, Dashboard and Reports all open with this band; Users was the
          one tab that did not, and it used a flat zinc card while the others
          used the panel gradient. Two of the four admin tabs looking like a
          different product is a background problem, so it is fixed here.

          The "← Dashboard" button that lived in this header is gone: Dashboard
          is a nav tab now, which is where a reader looks for it. */}
      <header className="bg-header-gradient text-white rounded-b-[50px] px-4 sm:px-10 pt-28 sm:pt-32 pb-20 shadow-[0_24px_70px_-24px_rgba(59,130,246,0.30)]">
        <div className="max-w-4xl mx-auto">
          <p className="text-oasys-blue text-sm font-bold uppercase tracking-widest mb-2">
            Access control
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3">
            Users
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl">
            {counts.All === undefined ? (
              <span className="text-gray-500">Loading accounts…</span>
            ) : (
              <>
                <strong className="text-white">
                  {accountCount} account{accountCount === 1 ? '' : 's'}
                </strong>
                {adminCount > 0 && (
                  <>
                    , <strong className="text-white">{adminCount}</strong> with
                    admin access
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-10 -mt-12 relative z-10 pb-20">
        <div className="bg-panel-gradient rounded-panel p-6 sm:p-8 shadow-xl text-white border border-white/10">
          {loadError && (
            <div
              role="alert"
              className="bg-red-950/80 border border-red-500/40 text-red-200 rounded-xl p-4 mb-6"
            >
              <p className="font-bold mb-1">Could not load users</p>
              <p className="text-sm">{loadError}</p>
            </div>
          )}

          <div role="group" aria-label="Filter accounts" className="flex flex-wrap gap-2 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                  filter === f
                    ? 'bg-oasys-blue text-white border-oasys-blue'
                    : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                }`}
              >
                {f}
                {counts[f] !== undefined && (
                  <span className={filter === f ? 'text-blue-100' : 'text-gray-500'}> {counts[f]}</span>
                )}
              </button>
            ))}
          </div>

          {isLoading && users.length === 0 ? (
            <p className="text-center text-gray-500 font-bold py-10">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-400 font-bold py-10">
              {filter === 'All' ? 'No users found.' : `No ${filter.toLowerCase()} accounts.`}
            </p>
          ) : (
            <ul
              className={`flex flex-col divide-y divide-white/5 transition-opacity ${
                isLoading ? 'opacity-50' : ''
              }`}
            >
              {users.map((user) => {
                const role = (user.role || 'user').toLowerCase();
                const isSelf = user.userloginuuid != null && user.userloginuuid === currentAdminId;

                return (
                  <li
                    key={user.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 py-4"
                  >
                    <div className="grow min-w-0">
                      <p className="font-bold truncate">
                        {user.username || 'Unnamed user'}
                        {isSelf && <span className="text-oasys-blue ml-2 text-sm">(you)</span>}
                      </p>
                      <p className="text-gray-400 text-sm truncate">{user.email || 'No email'}</p>
                    </div>

                    {role !== 'admin' && (
                      <label className="flex items-center gap-2 shrink-0 text-xs text-gray-400 font-bold">
                        <span className="sr-only sm:not-sr-only">Type</span>
                        <select
                          value={user.user_type ?? 'Civilian'}
                          disabled={savingType === user.id}
                          onChange={(e) => applyUserType(user, e.target.value)}
                          aria-label={`Reporter type for ${user.username || user.email || 'this user'}`}
                          className="bg-zinc-800 text-white border border-white/15 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60"
                        >
                          {USER_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase shrink-0 w-max ${
                        role === 'admin'
                          ? 'bg-oasys-blue/20 text-blue-300 border border-oasys-blue/40'
                          : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}
                    >
                      {roleLabel(role)}
                    </span>

                    {isSelf ? (
                      <span className="text-xs text-gray-500 italic shrink-0 sm:w-44 sm:text-right">
                        Protected
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          setPending({ user, newRole: role === 'admin' ? 'user' : 'admin' })
                        }
                        className="text-xs font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg transition-colors shrink-0 sm:w-44"
                      >
                        {role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <Pagination page={page} total={total} onChange={setPage} label="Accounts" />
          </div>
        </div>
      </div>

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="bg-white rounded-panel p-7 max-w-sm w-full shadow-2xl text-black">
            <h2 id="role-dialog-title" className="text-xl font-black mb-2">
              {pending.newRole === 'admin' ? 'Make admin?' : 'Remove admin access?'}
            </h2>
            <p className="text-zinc-600 font-medium text-sm mb-7">
              {pending.user.username || pending.user.email || 'This account'} will
              {pending.newRole === 'admin'
                ? ' gain full access to every report and user.'
                : ' lose admin access and become a regular user.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPending(null)}
                className="flex-1 bg-zinc-200 py-3 rounded-xl font-bold text-sm hover:bg-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyRoleChange}
                className="flex-1 bg-oasys-blue text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-red-950 border border-red-500/50 text-red-100 px-5 py-3 rounded-xl shadow-2xl max-w-md"
        >
          <p className="text-sm font-bold">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-xs underline mt-1 font-bold">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
