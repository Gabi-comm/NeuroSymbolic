// Password rules for sign-up and password reset.
//
// Follows NIST SP 800-63B-4 (Digital Identity Guidelines: Authentication and
// Authenticator Management, 2025), section 3.1.1.2, the current standard for
// memorized secrets:
//   - Length is what matters. A password that is the only thing protecting an
//     account must be at least 15 characters, and at least 64 must be allowed.
//   - No composition rules ("one capital, one number, one symbol"). They push
//     people to "Password1!" and add little real strength, so none are imposed.
//   - Every printable character is allowed, including spaces, so a passphrase
//     such as "jeepney stops near samson road" works.
//   - New passwords are checked against a blocklist: passwords already exposed
//     in breaches, very common ones, repetitive or sequential characters, and
//     words tied to this service or this user.
//   - The user gets feedback (the strength meter) instead of a bare refusal.
//   - No forced periodic changes. A reset is only needed after a compromise.
//
// This file is the browser half. Supabase stores and hashes the password; set
// its own minimum length to the same value (Authentication > Providers > Email
// > Minimum password length) so the rule also holds outside this form.

/** NIST SP 800-63B-4: 15 when the password is the only factor. */
export const PASSWORD_MIN_LENGTH = 15;
/** NIST asks for at least 64. Supabase (bcrypt) ignores bytes past 72. */
export const PASSWORD_MAX_LENGTH = 64;

// A short list of the passwords and fragments seen most often in breach
// corpora. The breach lookup below catches far more; this list works offline.
const COMMON = [
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'qwerty', 'qwertyuiop', 'asdfgh',
  'zxcvbn', 'letmein', 'welcome', 'iloveyou', 'admin', 'administrator', 'login',
  'master', 'monkey', 'dragon', 'football', 'baseball', 'basketball', 'sunshine',
  'princess', 'shadow', 'superman', 'batman', 'trustno1', 'abc123', '123456',
  '1234567890', '987654321', '111111', '000000', '123123', '654321', 'changeme',
  'secret', 'default', 'guest', 'test', 'user', 'mahalkita', 'iloveyoubaby',
  'pilipinas', 'philippines', 'manila', 'maganda', 'pogi', 'tanginamo',
];

// Words tied to this service and its study area. NIST asks for
// "context-specific words, such as the name of the service".
const CONTEXT = [
  'oasys', 'neurosymbolic', 'caloocan', 'samson', 'samsonroad', 'dpwh',
  'roaddefect', 'pothole', 'crack', 'thesis',
];

const COMMON_NORM = COMMON.map((w) => normalise(w));
const CONTEXT_NORM = CONTEXT.map((w) => normalise(w));

const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

export interface PasswordContext {
  email?: string;
  username?: string;
}

export interface PasswordCheck {
  /** True when the password meets every rule that can be checked offline. */
  ok: boolean;
  /** Why it was refused, said plainly. Empty when ok. */
  problems: string[];
  /**
   * Character types still missing ("Include at least one number."). Shown as
   * ways to make the password stronger; they do not block it, because NIST
   * SP 800-63B-4 says composition rules must not be required.
   */
  suggestions: string[];
  /** 0 (very weak) to 4 (strong), for the meter. */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

/** Lower case, with common letter-for-digit swaps undone (p@ssw0rd -> password). */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/\s+/g, '');
}

function hasLongRun(value: string): boolean {
  // Four or more of the same character in a row: "aaaa", "1111".
  return /(.)\1{3,}/u.test(value);
}

function hasSequence(value: string): boolean {
  const lower = value.toLowerCase();
  for (const seq of SEQUENCES) {
    const both = seq + ' ' + [...seq].reverse().join('');
    for (let i = 0; i + 4 <= lower.length; i++) {
      if (both.includes(lower.slice(i, i + 4))) return true;
    }
  }
  return false;
}

/** The user's own details, which an attacker who targets them would try first. */
function personalWords(ctx: PasswordContext): string[] {
  const words: string[] = [];
  const local = ctx.email?.split('@')[0] ?? '';
  for (const part of [local, ctx.username ?? '', ...local.split(/[._\-+]/)]) {
    const w = normalise(part);
    if (w.length >= 4) words.push(w);
  }
  return words;
}

/**
 * Most of the password is a blocked word (padded with a few digits or symbols,
 * as in "Caloocan2026!!"). A blocked word inside an otherwise long, varied
 * passphrase is fine, as NIST intends.
 */
function dominatedBy(norm: string, words: string[]): string | null {
  for (const w of words) {
    if (norm.includes(w) && w.length >= norm.length * 0.5) return w;
  }
  return null;
}

/** A rough guess at how hard the password is to guess, used for the meter only. */
function estimateBits(value: string): number {
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(value)) pool += 33;
  if (pool === 0) return 0;
  const unique = new Set(value).size;
  // Repeats add little: weight length by how varied the characters are.
  const effective = Math.min(value.length, unique * 2);
  return effective * Math.log2(pool);
}

export function checkPassword(password: string, ctx: PasswordContext = {}): PasswordCheck {
  const problems: string[] = [];
  const length = [...password].length;

  if (length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters (${length} so far).`);
  }
  if (length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const norm = normalise(password);
  if (length > 0) {
    if (dominatedBy(norm, COMMON_NORM)) {
      problems.push('This is built on a very common password. Pick something less predictable.');
    }
    if (dominatedBy(norm, CONTEXT_NORM)) {
      problems.push('Do not build your password on the name of this system or the study area.');
    }
    if (dominatedBy(norm, personalWords(ctx))) {
      problems.push('Do not build your password on your email or username.');
    }
    if (hasLongRun(password)) {
      problems.push('Avoid four or more of the same character in a row.');
    }
    if (hasSequence(password) && length < 20) {
      problems.push('Avoid runs such as "1234", "abcd" or "qwer".');
    }
  }

  const suggestions: string[] = [];
  if (length > 0) {
    if (!/[a-z]/.test(password)) suggestions.push('Include at least one lowercase letter.');
    if (!/[A-Z]/.test(password)) suggestions.push('Include at least one uppercase letter.');
    if (!/[0-9]/.test(password)) suggestions.push('Include at least one number.');
    if (!/[^a-zA-Z0-9\s]/.test(password)) suggestions.push('Include at least one symbol, such as ! @ # or $.');
  }

  const bits = estimateBits(password);
  let score: PasswordCheck['score'] =
    bits < 40 ? 0 : bits < 60 ? 1 : bits < 80 ? 2 : bits < 100 ? 3 : 4;
  // A password that breaks a rule never reads as better than Weak.
  if (problems.length && score > 1) score = 1;
  const label = (['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const)[score];

  return { ok: problems.length === 0, problems, suggestions, score, label };
}

/**
 * Has this password appeared in a known data breach?
 *
 * Uses the Have I Been Pwned "Pwned Passwords" range API with k-anonymity: only
 * the first 5 characters of the password's SHA-1 hash leave the browser, never
 * the password and never the full hash. The service returns every hash suffix
 * that starts with those 5 characters, and the match is made here.
 *
 * Returns the number of times it was seen, 0 if never, or null when the lookup
 * could not be made (offline, blocked). A failed lookup does not block sign-up;
 * the offline rules above still apply.
 */
export async function breachCount(password: string): Promise<number | null> {
  try {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding hides the size of the answer, which could otherwise hint at the prefix.
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    for (const line of (await res.text()).split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

/** The breach result as a refusal message, or null when it is fine to use. */
export function breachMessage(count: number | null): string | null {
  if (!count) return null;
  return (
    `This password has appeared in ${count.toLocaleString()} known data breach` +
    `${count === 1 ? '' : 'es'}, so attackers already try it. Choose a different one.`
  );
}
