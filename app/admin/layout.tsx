'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import {
  AdminSessionContext,
  getVerifiedAdmin,
  loadAdminSummary,
  setVerifiedAdmin,
  type AdminSession,
} from '@/utils/adminData';

type AuthState = 'checking' | 'authorized' | 'denied';

/**
 * Client-side admin gate.
 *
 * This is a UX guard, not a security boundary. It stops a non-admin from seeing
 * the console shell, but anyone can bypass it in a debugger. The real boundaries
 * are `proxy.ts` (signed-in check) and, decisively, Supabase RLS -- the anon key
 * ships to every browser, so only a database policy actually protects the rows.
 *
 * The previous version read `useRef().current` during render to seed state and
 * looped the effect on its own output. A plain state machine does the same job
 * without either problem.
 *
 * Speed: the session is read locally with getSession() rather than getUser(),
 * which was a round trip to the auth server before anything else could start.
 * That is safe here because the role lookup that follows is a database query
 * under RLS, which verifies the token server-side; a forged local session gets
 * no profile back and is denied. Role and username come in one query and are
 * shared with the pages through AdminSessionContext, and the Console/Dashboard
 * data is requested alongside it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Already verified in this browser session (the layout remounts on every
  // admin page change): render now, re-check below.
  const [authState, setAuthState] = useState<AuthState>(() =>
    getVerifiedAdmin() ? 'authorized' : 'checking'
  );
  const [session, setSession] = useState<AdminSession | null>(() => getVerifiedAdmin());
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const checkAdminStatus = async () => {
      try {
        const {
          data: { session: authSession },
          error: authError,
        } = await supabase.auth.getSession();
        const user = authSession?.user;

        if (authError || !user) {
          setVerifiedAdmin(null);
          if (isMounted) setAuthState('denied');
          router.replace('/');
          return;
        }

        // In parallel with the role check; errors surface on the page that uses it.
        loadAdminSummary().catch(() => {});

        const { data: profile, error: dbError } = await supabase
          .from('UserDetail')
          .select('role, username')
          .eq('userloginuuid', user.id)
          .maybeSingle();

        if (dbError || profile?.role?.toLowerCase() !== 'admin') {
          setVerifiedAdmin(null);
          if (isMounted) setAuthState('denied');
          router.replace('/');
          return;
        }

        const verified = { userId: user.id, username: profile.username ?? user.email ?? null };
        setVerifiedAdmin(verified);
        if (isMounted) {
          setSession(verified);
          setAuthState('authorized');
        }
      } catch {
        setVerifiedAdmin(null);
        if (isMounted) setAuthState('denied');
        router.replace('/');
      }
    };

    checkAdminStatus();
    return () => {
      isMounted = false;
    };
  }, [router]);

  if (authState !== 'authorized') {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-fg px-4"
        aria-live="polite"
      >
        <p className="font-bold tracking-widest uppercase text-sm text-center">
          {authState === 'checking' ? 'Verifying admin access…' : 'Access denied. Redirecting…'}
        </p>
      </div>
    );
  }

  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}
