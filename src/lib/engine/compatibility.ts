import type { Category, Resource, Rule, Shelter } from "../types";

export interface CompatResult {
  ok: boolean;
  /** Set when a verified rule fails (ok is false) or the shelter is unusable. */
  reason: string | null;
  /** Set when an unverified rule fails: the assignment may proceed but is flagged. */
  flag: string | null;
}

const has = (s: Shelter, r: Resource) => (r === "water" ? s.has_water : r === "cooking_fuel" ? s.has_cooking_fuel : s.has_cold_storage);
const words = (x: string) => x.replace(/_/g, " ");

/** Mirrors _compat in the database. A verified failure blocks; an unverified failure is flagged, never passed silently. */
export function checkCompatibility(category: Category, shelter: Shelter, rules: Rule[]): CompatResult {
  if (shelter.status !== "open") return { ok: false, reason: `${shelter.name} is closed`, flag: null };
  if (!shelter.accepted_categories.includes(category)) {
    return { ok: false, reason: `${shelter.name} does not accept ${words(category)}`, flag: null };
  }
  let flag: string | null = null;
  for (const rule of rules.filter((r) => r.category === category).sort((a, b) => a.id.localeCompare(b.id))) {
    const missing = rule.required_resources.filter((r) => !has(shelter, r)).map(words);
    if (!missing.length) continue;
    if (rule.verified) {
      return {
        ok: false,
        reason: `Blocked: ${words(category)} needs ${missing.join(" and ")} at the shelter, and ${shelter.name} has none. Basis: ${rule.source_note}`,
        flag: null,
      };
    }
    const msg = `Rule pending verification: ${words(category)} may need ${missing.join(" and ")} at ${shelter.name}`;
    flag = flag ? `${flag}; ${msg}` : msg;
  }
  return { ok: true, reason: null, flag };
}
