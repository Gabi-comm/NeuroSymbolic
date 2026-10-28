'use client';

import { useAuth } from '@/components/shell/AuthProvider';
import Landing from '@/components/dashboard/Landing';
import UserDashboard from '@/components/dashboard/UserDashboard';

// Signed-in reporters land on their dashboard (what's mine, and what still
// needs me); visitors get the landing hero.
export default function HomePage() {
  const { authUser, authChecked, profile } = useAuth();

  if (!authChecked) {
    return (
      <main className="px-4 sm:px-8 lg:px-10 pt-5 md:pt-8 max-w-[1240px] mx-auto" aria-busy="true">
        <div className="skeleton h-44 rounded-[28px]" />
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      </main>
    );
  }

  if (!authUser) return <Landing />;

  const name = profile?.username || authUser.email?.split('@')[0] || 'there';
  return <UserDashboard userId={authUser.id} name={name} />;
}
