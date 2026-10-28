'use client';

import AuthProvider from './AuthProvider';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import BottomTabBar from './BottomTabBar';
import CommandPalette from './CommandPalette';
import Tour from '@/components/help/Tour';
import IntroSplash from '@/components/help/IntroSplash';

/**
 * Sidebar on desktop, navy header + bottom tabs on phones. Replaces the old
 * fixed top bar (components/Navigation), so pages no longer pad for it.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Sidebar />
      <MobileHeader />
      {children}
      <BottomTabBar />
      <CommandPalette />
      <Tour />
      <IntroSplash />
    </AuthProvider>
  );
}
