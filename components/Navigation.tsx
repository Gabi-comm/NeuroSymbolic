"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import LoginModal from './LoginModal';
import { supabase } from '@/utils/supabase';

export default function Navigation() {
  const [showLogin, setShowLogin] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const [authUser, setAuthUser] = useState<any>(null);
  const [dbProfile, setDbProfile] = useState<any>(null);
  
  const router = useRouter(); 

  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', controlNavbar);
    return () => window.removeEventListener('scroll', controlNavbar);
  }, [lastScrollY]);

  // Fetch DB Profile Helper
  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('UserDetail')
      .select('username, role')
      .eq('userloginuuid', userId)
      .single();
      
    if (!error && data) {
      setDbProfile(data);
      return data; 
    }
    return null;
  };

  // Supabase Auth Listener
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthUser(session?.user || null);
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      }
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthUser(session?.user || null);
      
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (event === 'SIGNED_IN' && profile?.role === 'admin') {
          router.push('/admin/dashboard');
        }
      } else {
        setDbProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null); 
    setDbProfile(null);
    router.push('/'); 
    router.refresh(); 
  };

  return (
    <>
      <nav 
        className={`fixed top-0 w-full z-50 flex justify-between items-center p-8 transition-all ${ isVisible ? 'translate-y-0' : '-translate-y-full' }`}
        style={{ backgroundColor: isVisible && lastScrollY > 50 ? 'rgba(26, 26, 26, 0.9)' : 'transparent' }}
      >
        {/* Left Side: User Greeting */}
        <div className="flex items-center">
          {authUser && dbProfile ? (
            <span className="text-white font-bold">
              Hi, <span className="text-white">{dbProfile.username || "User"}</span>
            </span>
          ) : (
            <div className="w-12 h-12" /> 
          )}
        </div>

        {/* Right Side: Links and Actions */}
        <div className="flex items-center gap-8">
          
          <Link 
            href={dbProfile?.role === 'admin' ? '/admin/dashboard' : '/'} 
            className="text-white hover:text-blue-400 font-bold transition-colors"
          >
            Home
          </Link>

          <Link href="/upload-media" className="text-white hover:text-blue-400 font-bold transition-colors">Scan</Link>
          <Link href="/report-damage" className="text-white hover:text-blue-400 font-bold transition-colors">Report</Link>
          <Link href="/about" className="text-white hover:text-blue-400 font-bold transition-colors">About Us</Link>
          
          {authUser ? (
            <div className="border-l border-white/20 pl-8 ml-2">
              <button 
                onClick={handleLogout}
                className="bg-red-500/10 text-white border border-red-500 px-5 py-2 rounded-full font-bold hover:bg-red-500 hover:text-white transition-all"
              >
                Log Out
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-3 bg-[#D9D9D9] text-black px-5 py-2 rounded-full font-bold hover:bg-white transition-all ml-4"
            >
              Sign-In
              <span className="w-4 h-4 bg-blue-500 rounded-full" />
            </button>
          )}
        </div>
      </nav>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}