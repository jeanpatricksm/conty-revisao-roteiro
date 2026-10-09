export const BRAND_TIME_ZONE = "America/Sao_Paulo";

const civilDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRAND_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil (YYYY-MM-DD) de um instante no fuso da marca. */
export function brandDay(at: Date): string {
  return civilDayFormat.format(at);
}

/** Aceita só YYYY-MM-DD que seja uma data real do calendário. */
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** O prazo vale até o último instante do dia no fuso da marca. */
export function isPastDue(dueDate: string, at: Date): boolean {
  return brandDay(at) > dueDate;
}
