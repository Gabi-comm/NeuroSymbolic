'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import Pagination, { pageRange } from '@/components/Pagination';
import { ProgressList } from '@/components/Charts';
import { AdminHeader, ConfirmDialog, ErrorNote, PAGE, Panel, Toast, UnderlineTabs } from '@/components/admin/ui';

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
  return filter === 'Civilian' ? nonAdmin.or('user_type.is.null,user_type.eq.Civilian') : nonAdmin.eq('user_type', filter);
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
        FILTERS.map((f) => applyFilter(supabase.from('UserDetail').select('id', { count: 'exact', head: true }), f)),
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
        const { data, error, count } = await applyFilter(supabase.from('UserDetail').select('*', { count: 'exact' }), filter)
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

    const { error } = await supabase.from('UserDetail').update({ role: newRole }).eq('id', user.id);

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
    const { error } = await supabase.from('UserDetail').update({ user_type: userType }).eq('id', user.id);
    if (error) {
      setActionError(`Could not update the reporter type: ${error.message}`);
    } else {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, user_type: userType } : u)));
      reload();
    }
    setSavingType(null);
  };

  const composition = [...USER_TYPES, 'Admin' as const].map((t) => ({
    label: t === 'Admin' ? 'Admins' : `${t}s`,
    name: t,
    value: counts[t] ?? 0,
  }));

  return (
    <main className={PAGE}>
      <AdminHeader eyebrow="Access control" title="Users" />

      {loadError && <ErrorNote title="Could not load users" message={loadError} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Panel title="Accounts" className="lg:sticky lg:top-6">
          <p className="font-stat text-5xl leading-none text-fg">
            {counts.All === undefined ? <span className="skeleton inline-block h-10 w-16 rounded-lg" /> : accountCount}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{adminCount} with admin access</p>
          <div className="mt-6">
            {counts.All === undefined ? (
              <div className="skeleton h-40 rounded-xl" />
            ) : (
              <ProgressList items={composition} total={accountCount} emptyMessage="No accounts yet." />
            )}
          </div>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title={
            <UnderlineTabs
              label="Filter accounts"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(1);
              }}
              tabs={FILTERS.map((f) => ({ key: f, label: f, count: counts[f] }))}
            />
          }
        >
          {isLoading && users.length === 0 ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">
              {filter === 'All' ? 'No users found.' : `No ${filter.toLowerCase()} accounts.`}
            </p>
          ) : (
            <ul className={`stagger -my-2 divide-y divide-line transition-opacity ${isLoading ? 'opacity-50' : ''}`}>
              {users.map((user) => {
                const role = (user.role || 'user').toLowerCase();
                const isSelf = user.userloginuuid != null && user.userloginuuid === currentAdminId;
                const name = user.username || 'Unnamed user';

                return (
                  <li key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3.5">
                    <div className="flex items-center gap-3 grow min-w-0">
                      <span
                        aria-hidden="true"
                        className="grid place-items-center w-10 h-10 rounded-full bg-accent-soft text-accent font-semibold shrink-0"
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg truncate">
                          {name}
                          {isSelf && <span className="ml-2 text-xs font-medium text-accent">you</span>}
                        </span>
                        <span className="block text-xs text-fg-muted truncate">{user.email || 'No email'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 shrink-0 pl-[52px] sm:pl-0">
                      {/* Role: glyph + word, no chip behind it. */}
                      <span
                        className={`inline-flex items-center gap-1.5 w-16 text-[11px] font-semibold uppercase tracking-wide ${
                          role === 'admin' ? 'text-accent' : 'text-fg-muted'
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="w-3.5 h-3.5"
                          fill={role === 'admin' ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          {role === 'admin' ? (
                            <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6Z" />
                          ) : (
                            <>
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                            </>
                          )}
                        </svg>
                        {roleLabel(role)}
                      </span>

                      {role !== 'admin' ? (
                        <label className="shrink-0">
                          <span className="sr-only">Reporter type for {user.username || user.email || 'this user'}</span>
                          <select
                            value={user.user_type ?? 'Civilian'}
                            disabled={savingType === user.id}
                            onChange={(e) => applyUserType(user, e.target.value)}
                            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-fg hover:border-line-strong disabled:opacity-60"
                          >
                            {USER_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="w-[6.4rem] hidden sm:block" />
                      )}

                      {isSelf ? (
                        <span className="w-28 text-right text-xs text-fg-faint">Protected</span>
                      ) : (
                        <button
                          onClick={() => setPending({ user, newRole: role === 'admin' ? 'user' : 'admin' })}
                          className="w-28 h-9 rounded-lg border border-line text-xs font-semibold text-fg hover:border-line-strong transition-colors"
                        >
                          {role === 'admin' ? 'Remove admin' : 'Make admin'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <Pagination page={page} total={total} onChange={setPage} label="Accounts" />
          </div>
        </Panel>
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.newRole === 'admin' ? 'Make admin?' : 'Remove admin access?'}
          body={
            <>
              {pending.user.username || pending.user.email || 'This account'} will
              {pending.newRole === 'admin'
                ? ' gain full access to every report and user.'
                : ' lose admin access and become a regular user.'}
            </>
          }
          confirm={pending.newRole === 'admin' ? 'Make admin' : 'Remove access'}
          tone={pending.newRole === 'admin' ? 'accent' : 'danger'}
          onCancel={() => setPending(null)}
          onConfirm={applyRoleChange}
        />
      )}

      {actionError && <Toast message={actionError} onDismiss={() => setActionError(null)} />}
    </main>
  );
}
