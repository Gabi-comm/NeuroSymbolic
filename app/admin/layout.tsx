'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use a ref to track if we've already passed the check once in this session
  const hasVerified = useRef(false);
  
  // Initialize state based on whether we've already verified
  const [isAuthorized, setIsAuthorized] = useState(hasVerified.current);
  const [authMessage, setAuthMessage] = useState("Verifying Admin Access...");
  const router = useRouter();

  useEffect(() => {
    // IF we are already authorized, don't run the fetch again
    if (isAuthorized) return;

    const checkAdminStatus = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace('/');
          return;
        }

        const { data: profile, error: dbError } = await supabase
          .from('UserDetail')
          .select('role')
          .eq('userloginuuid', user.id)
          .maybeSingle();

        if (dbError || !profile || profile.role?.toLowerCase() !== 'admin') {
          setAuthMessage("Access Denied.");
          router.replace('/');
          return;
        }

        // SUCCESS: Set both the Ref and the State
        hasVerified.current = true;
        setIsAuthorized(true);

      } catch (err) {
        console.error("Auth Error:", err);
        router.replace('/');
      }
    };

    checkAdminStatus();
  }, [isAuthorized, router]);

  // Only show the loading screen if we haven't authorized yet
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-white">
        <p className="animate-pulse font-bold tracking-widest uppercase text-sm">{authMessage}</p>
      </div>
    );
  }

  // Once authorized, this stays rendered even when switching sub-pages!
  return <>{children}</>;
}