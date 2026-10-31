import type { ComponentType } from 'react';
import {
  IconChart,
  IconCamera,
  IconGrid,
  IconHome,
  IconInfo,
  IconList,
  IconReport,
  IconUsers,
} from './icons';

export interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Signed-out visitors are asked to sign in instead of being sent here. */
  needsAuth?: boolean;
  /** Matched by `data-tour` in the guided tour. */
  tour?: string;
}

export const USER_LINKS: NavLink[] = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/report-damage', label: 'Report', icon: IconReport, tour: 'nav-report' },
  { href: '/captured-distress', label: 'Captured Distress', icon: IconCamera, needsAuth: true, tour: 'nav-captured' },
  { href: '/my-reports', label: 'My reports', icon: IconList, needsAuth: true, tour: 'nav-reports' },
];

export const INFO_LINKS: NavLink[] = [{ href: '/about', label: 'About', icon: IconInfo }];

// Admins get the console's sections; everyone else gets the public site.
// Showing Report / About to an administrator mixed two different jobs in one
// menu and buried the pages they actually work in.
export const ADMIN_LINKS: NavLink[] = [
  { href: '/admin', label: 'Console', icon: IconGrid },
  { href: '/admin/dashboard', label: 'Dashboard', icon: IconChart, tour: 'nav-admin-dashboard' },
  { href: '/admin/reports', label: 'Reports', icon: IconList, tour: 'nav-admin-reports' },
  { href: '/admin/users', label: 'Users', icon: IconUsers, tour: 'nav-admin-users' },
];

/** Exact match for the roots, prefix match for everything below them. */
export function isActive(pathname: string, href: string) {
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Window events the shell listens for, so any page can open these. */
export const SHELL_EVENTS = {
  palette: 'oasys:palette',
  tour: 'oasys:tour',
} as const;
