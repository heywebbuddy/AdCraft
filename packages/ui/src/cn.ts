export type ClassValue = string | number | null | false | undefined | ClassValue[];

/** Tiny classnames helper (no tailwind-merge yet). */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i) continue;
    if (Array.isArray(i)) {
      const nested = cn(...i);
      if (nested) out.push(nested);
    } else out.push(String(i));
  }
  return out.join(" ");
}
