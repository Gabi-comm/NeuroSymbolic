'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginModal from '@/components/LoginModal';
import { supabase } from '@/utils/supabase';

interface DbProfile {
  username: string | null;
  role: string | null;
}

interface AuthValue {
  authUser: { id: string; email?: string } | null;
  /** False until the first auth event; render placeholders, not "Sign in". */
  authChecked: boolean;
  profile: DbProfile | null;
  isAdmin: boolean;
  openLogin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/**
 * The session and profile the shell (sidebar, mobile header, tab bar, command
 * palette) all read. This is the logic that lived in components/Navigation,
 * moved unchanged so every piece of chrome shares one subscription.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [showLogin, setShowLogin] = useState(false);
  const [authUser, setAuthUser] = useState<AuthValue['authUser']>(null);
  // The session is read asynchronously, so authUser is null on the first paint
  // whether or not someone is signed in. Rendering the auth control before this
  // resolves showed "Sign in" to signed-in users for a frame, then swapped it
  // for "Log out" -- a visible flicker on every navigation. Nothing is rendered
  // in that slot until we actually know.
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('UserDetail')
      .select('username, role')
      .eq('userloginuuid', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
      return data;
    }
    return null;
  }, []);

  // Who was signed in before the latest auth event. Supabase fires SIGNED_IN
  // not only on a real sign-in but again whenever the browser tab regains
  // focus and the session is re-checked, so the event alone cannot tell a
  // login from a tab switch.
  const signedInUserRef = useRef<string | null>(null);

  useEffect(() => {
    // As in UploadResultUi: no awaited getSession(). onAuthStateChange fires
    // INITIAL_SESSION on subscribe, which is all this needs, and awaiting an
    // auth call here risks hanging on the shared auth lock.

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthChecked(true);

      const previousUserId = signedInUserRef.current;
      signedInUserRef.current = session?.user?.id ?? null;

      if (!session?.user) {
        setProfile(null);
        return;
      }

      // Only a transition from signed out to signed in is a login. INITIAL_SESSION
      // (page load) and the SIGNED_IN that a tab refocus fires both arrive with
      // the same user already recorded, and must not move the admin off the page.
      const justSignedIn = event === 'SIGNED_IN' && previousUserId !== session.user.id;

      // Deferred out of the callback on purpose. Supabase documents that
      // calling its own methods inside an onAuthStateChange handler can
      // deadlock, because the handler runs while the auth lock is held. A
      // zero-delay timeout runs the query on the next tick, after the lock is
      // released.
      const userId = session.user.id;
      setTimeout(async () => {
        const fetched = await fetchUserProfile(userId);
        if (justSignedIn && fetched?.role?.toLowerCase() === 'admin') {
          router.push('/admin');
        }
      }, 0);
    });

    // If the subscription never reports, show the signed-out control rather
    // than leaving a placeholder in the header indefinitely.
    const authTimeout = setTimeout(() => setAuthChecked(true), 5000);

    return () => {
      clearTimeout(authTimeout);
      authListener.subscription.unsubscribe();
    };
  }, [router, fetchUserProfile]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
    router.push('/');
    router.refresh();
  }, [router]);

  const openLogin = useCallback(() => setShowLogin(true), []);

  const value: AuthValue = {
    authUser,
    authChecked,
    profile,
    isAdmin: profile?.role?.toLowerCase() === 'admin',
    openLogin,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </AuthContext.Provider>
  );
}
