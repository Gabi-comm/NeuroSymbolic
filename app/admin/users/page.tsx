'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

interface UserProfile {
  userloginuuid: string;
  username: string | null;
  email: string | null;
  role: string | null;
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

  const adminCount = users.filter((u) => (u.role || '').toLowerCase() === 'admin').length;

  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        setIsLoading(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && isMounted) setCurrentAdminId(user.id);

        const { data, error } = await supabase
          .from('UserDetail')
          .select('*')
          .order('username', { ascending: true });

        if (error) throw error;
        if (isMounted) setUsers(data ?? []);
      } catch (err) {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Could not load users.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  const applyRoleChange = async () => {
    if (!pending) return;
    const { user, newRole } = pending;
    setActionError(null);

    // Server-side guard is the RLS policy; this only prevents the obvious mistake.
    if (user.userloginuuid === currentAdminId) {
      setActionError('You cannot change your own admin status.');
      setPending(null);
      return;
    }

    const { error } = await supabase
      .from('UserDetail')
      .update({ role: newRole })
      .eq('userloginuuid', user.userloginuuid);

    if (error) {
      setActionError(`Could not update the role: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.userloginuuid === user.userloginuuid ? { ...u, role: newRole } : u
        )
      );
    }
    setPending(null);
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
            {isLoading ? (
              <span className="text-gray-500">Loading accounts…</span>
            ) : (
              <>
                <strong className="text-white">
                  {users.length} account{users.length === 1 ? '' : 's'}
                </strong>
                {adminCount > 0 && (
                  <>
                    , <strong className="text-white">{adminCount}</strong> with
                    administrator access
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

          {isLoading ? (
            <p className="text-center text-gray-500 font-bold py-10">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-400 font-bold py-10">No users found.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {users.map((user) => {
                const role = (user.role || 'user').toLowerCase();
                const isSelf = user.userloginuuid === currentAdminId;

                return (
                  <li
                    key={user.userloginuuid}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 py-4"
                  >
                    <div className="grow min-w-0">
                      <p className="font-bold truncate">
                        {user.username || 'Unnamed user'}
                        {isSelf && <span className="text-oasys-blue ml-2 text-sm">(you)</span>}
                      </p>
                      <p className="text-gray-400 text-sm truncate">{user.email || 'No email'}</p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase shrink-0 w-max ${
                        role === 'admin'
                          ? 'bg-oasys-blue/20 text-blue-300 border border-oasys-blue/40'
                          : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}
                    >
                      {role}
                    </span>

                    {isSelf ? (
                      <span className="text-xs text-gray-500 italic shrink-0 sm:w-32 sm:text-right">
                        Protected
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          setPending({ user, newRole: role === 'admin' ? 'user' : 'admin' })
                        }
                        className="text-xs font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg transition-colors shrink-0 sm:w-32"
                      >
                        Make {role === 'admin' ? 'user' : 'admin'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
              Change role to {pending.newRole}?
            </h2>
            <p className="text-zinc-600 font-medium text-sm mb-7">
              {pending.user.username || pending.user.email || 'This account'} will
              {pending.newRole === 'admin'
                ? ' gain full access to every report and user.'
                : ' lose administrator access.'}
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
