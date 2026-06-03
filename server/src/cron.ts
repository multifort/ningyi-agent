/**
 * Minimal 5-field cron parser (no external dependency).
 * Fields: minute hour day-of-month month day-of-week
 * Supports: *, lists (1,2,3), ranges (1-5), steps (* /2, 10-20/2).
 */

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    let step = 1;
    let range = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      step = parseInt(part.slice(slash + 1), 10);
      range = part.slice(0, slash);
    }
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const dash = range.indexOf("-");
      if (dash !== -1) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = hi = parseInt(range, 10);
      }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || Number.isNaN(step) || step < 1) {
      throw new Error(`Invalid cron field: ${field}`);
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`Cron field out of range: ${part} (allowed ${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) result.add(v);
    }
  }
  if (result.size === 0) throw new Error(`Cron field produced no values: ${field}`);
  return result;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Cron expression must have 5 fields");
  }
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6), // 0 = Sunday
  };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function matches(fields: CronFields, d: Date): boolean {
  return (
    fields.minute.has(d.getMinutes()) &&
    fields.hour.has(d.getHours()) &&
    fields.month.has(d.getMonth() + 1) &&
    // Standard cron: if both dom and dow are restricted, match either.
    domDowMatch(fields, d)
  );
}

function domDowMatch(fields: CronFields, d: Date): boolean {
  const domRestricted = fields.dom.size < 31;
  const dowRestricted = fields.dow.size < 7;
  const domOk = fields.dom.has(d.getDate());
  const dowOk = fields.dow.has(d.getDay());
  if (domRestricted && dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

/**
 * Compute the next run time strictly after `from`.
 * Scans minute-by-minute up to ~366 days ahead; returns null if none.
 */
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const fields = parseCron(expr);
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // strictly after
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matches(fields, d)) return new Date(d.getTime());
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}
