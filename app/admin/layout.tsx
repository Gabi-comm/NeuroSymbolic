'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

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
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const checkAdminStatus = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          if (isMounted) setAuthState('denied');
          router.replace('/');
          return;
        }

        const { data: profile, error: dbError } = await supabase
          .from('UserDetail')
          .select('role')
          .eq('userloginuuid', user.id)
          .maybeSingle();

        if (dbError || profile?.role?.toLowerCase() !== 'admin') {
          if (isMounted) setAuthState('denied');
          router.replace('/');
          return;
        }

        if (isMounted) setAuthState('authorized');
      } catch {
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
        className="min-h-screen bg-dark-bg flex items-center justify-center text-white px-4"
        aria-live="polite"
      >
        <p className="font-bold tracking-widest uppercase text-sm text-center">
          {authState === 'checking' ? 'Verifying admin access…' : 'Access denied. Redirecting…'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
