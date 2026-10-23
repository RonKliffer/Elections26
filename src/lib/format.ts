import type { Rational } from './types';
export const number = (value: number | null | undefined, decimals = 0): string =>
  value == null
    ? '—'
    : new Intl.NumberFormat('he-IL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
export const signed = (value: number, decimals = 0): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), decimals)}`;
export function time(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(value))
    : 'לא פורסם';
}
export function fullTime(value: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}
export const fraction = (r: Rational | null): string =>
  r ? `${number(Number(r.numerator))} / ${number(Number(r.denominator))}` : '—';
