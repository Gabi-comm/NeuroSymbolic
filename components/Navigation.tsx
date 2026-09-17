'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import LoginModal from './LoginModal';
import { supabase } from '@/utils/supabase';

interface DbProfile {
  username: string | null;
  role: string | null;
}

export default function Navigation() {
  const [showLogin, setShowLogin] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const [authUser, setAuthUser] = useState<{ id: string } | null>(null);
  const [dbProfile, setDbProfile] = useState<DbProfile | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // Hide on scroll down, reveal on scroll up. Reading lastScrollY from a ref-like
  // closure rather than state avoids re-subscribing the listener on every scroll
  // event, which the previous version did on all 60 frames a second.
  useEffect(() => {
    let lastScrollY = window.scrollY;

    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(!(currentScrollY > lastScrollY && currentScrollY > 80));
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', controlNavbar, { passive: true });
    return () => window.removeEventListener('scroll', controlNavbar);
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('UserDetail')
      .select('username, role')
      .eq('userloginuuid', userId)
      .maybeSingle();

    if (!error && data) {
      setDbProfile(data);
      return data;
    }
    return null;
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setAuthUser(session?.user ?? null);
      if (session?.user) await fetchUserProfile(session.user.id);
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthUser(session?.user ?? null);

      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (event === 'SIGNED_IN' && profile?.role?.toLowerCase() === 'admin') {
          router.push('/admin/dashboard');
        }
      } else {
        setDbProfile(null);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [router, fetchUserProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setDbProfile(null);
    router.push('/');
    router.refresh();
  };

  const isAdmin = dbProfile?.role?.toLowerCase() === 'admin';

  const links = [
    { href: isAdmin ? '/admin/dashboard' : '/', label: isAdmin ? 'Dashboard' : 'Home' },
    { href: '/upload-media', label: 'Scan' },
    { href: '/report-damage', label: 'Report' },
    { href: '/about', label: 'About' },
  ];

  const linkClass = (href: string) =>
    `font-bold transition-colors ${
      pathname === href ? 'text-oasys-blue' : 'text-white hover:text-oasys-blue'
    }`;

  return (
    <>
      <nav
        aria-label="Main"
        className={`fixed top-0 w-full z-50 transition-transform ${
          isVisible ? 'translate-y-0' : '-translate-y-full'
        } ${menuOpen ? 'bg-dark-bg' : 'bg-dark-bg/90 backdrop-blur-sm'}`}
      >
        <div className="flex justify-between items-center gap-4 px-4 sm:px-8 py-4 sm:py-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="OASYS home">
            <Image
              src="/oasys-logo-small.png"
              alt=""
              width={96}
              height={96}
              priority
              className="w-8 h-8 object-contain"
            />
            <span className="font-black text-lg tracking-tight">OASYS</span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-7">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}

            {authUser ? (
              <div className="flex items-center gap-4 border-l border-white/20 pl-6">
                {dbProfile?.username && (
                  <span className="text-sm text-gray-300">
                    Hi, <span className="font-bold text-white">{dbProfile.username}</span>
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  className="bg-red-500/10 text-white border border-red-500 px-5 py-2 rounded-full font-bold hover:bg-red-500 transition-all"
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-surface-light text-black px-5 py-2 rounded-full font-bold hover:bg-white transition-all"
              >
                Sign in
              </button>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden p-2 -mr-2 text-white"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div
            id="mobile-menu"
            className="md:hidden border-t border-white/10 px-4 pb-5 pt-2 flex flex-col gap-1"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                // Closed on click rather than in an effect on pathname: the effect
                // fired a synchronous setState on every navigation.
                onClick={() => setMenuOpen(false)}
                className={`${linkClass(link.href)} py-3 px-2 rounded-lg hover:bg-white/5`}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-3 mt-2 border-t border-white/10">
              {authUser ? (
                <>
                  {dbProfile?.username && (
                    <p className="text-sm text-gray-400 px-2 pb-3">
                      Signed in as{' '}
                      <span className="font-bold text-white">{dbProfile.username}</span>
                    </p>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full bg-red-500/10 text-white border border-red-500 px-5 py-3 rounded-full font-bold"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowLogin(true);
                  }}
                  className="w-full bg-surface-light text-black px-5 py-3 rounded-full font-bold"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
