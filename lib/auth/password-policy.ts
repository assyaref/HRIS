/**
 * Password policy — pure, framework-free validation shared by:
 * - `features/account/change-password-schema.ts` (zod refinement),
 * - the change-password UI requirement checklist,
 * - the administrative reset temporary-password checks.
 *
 * Deliberately free of `server-only`, database and Next.js imports so the
 * rules can be unit-tested with `node --test` and imported by client
 * components. Enforcement always happens server-side; the UI only mirrors
 * these rules.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleKey =
  | "minLength"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "special";

export interface PasswordRequirement {
  key: PasswordRuleKey;
  /** Human-facing rule description (Indonesian UI copy). */
  label: string;
  /** Validate one candidate password against this rule. */
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    key: "minLength",
    label: `Minimal ${PASSWORD_MIN_LENGTH} karakter`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: "uppercase",
    label: "Huruf besar",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    key: "lowercase",
    label: "Huruf kecil",
    test: (password) => /[a-z]/.test(password),
  },
  {
    key: "digit",
    label: "Angka",
    test: (password) => /[0-9]/.test(password),
  },
  {
    key: "special",
    label: "Karakter khusus",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export interface PasswordPolicyResult {
  ok: boolean;
  /** Keys of the rules the candidate password failed. */
  failures: PasswordRuleKey[];
}

/**
 * Evaluate a candidate password against the full policy.
 *
 * Length bounds are always enforced; the complexity rules are configurable
 * so administrative temporary passwords can be judged on the same base
 * policy (a forced-change always follows a reset, so the owner will have to
 * satisfy the full policy themselves).
 */
export function validatePasswordPolicy(
  password: string,
  options: { complexity?: boolean } = {}
): PasswordPolicyResult {
  const { complexity = true } = options;
  const failures: PasswordRuleKey[] = [];

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    failures.push("minLength");
  }

  if (complexity) {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      if (requirement.key === "minLength") continue;
      if (!requirement.test(password)) failures.push(requirement.key);
    }
  }

  return { ok: failures.length === 0, failures };
}

/** First failed rule's human-facing message, or null when the policy passes. */
export function passwordPolicyMessage(result: PasswordPolicyResult): string | null {
  if (result.ok) return null;
  const first = PASSWORD_REQUIREMENTS.find((requirement) =>
    result.failures.includes(requirement.key)
  );
  if (first?.key === "minLength") {
    return `Password baru minimal ${PASSWORD_MIN_LENGTH} karakter dan maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  }
  return first ? `Password baru harus mengandung ${first.label.toLowerCase()}.` : null;
}
