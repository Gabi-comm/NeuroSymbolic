// Kept apart from theme.ts: that module is client-only, and the root layout (a
// server component) needs this as a plain string.

export const THEME_KEY = 'oasys.theme';
export const INTRO_KEY = 'oasys.introSeen';

/**
 * Theme (and intro flag) before first paint (inlined in app/layout), so the page never flashes
 * the wrong theme. Light unless the visitor picked Dark; there is deliberately
 * no "follow the system" option.
 */
export const THEME_BOOT_SCRIPT =
  `try{document.documentElement.dataset.theme=localStorage.getItem('${THEME_KEY}')==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}` +
  // The intro splash plays once per session. Flagging it here lets CSS cover
  // the page in navy before React mounts the splash, so nothing flashes.
  `try{if(!sessionStorage.getItem('${INTRO_KEY}')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.intro='1'}catch(e){}`;
