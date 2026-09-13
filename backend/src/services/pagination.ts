import { z } from 'zod';

const decimalInteger = z.string().regex(/^\d+$/).transform(value => Number(value));

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const boundedNumber = z.number().safe().int().min(minimum).max(maximum);
  if (value === undefined) return boundedNumber.parse(fallback);
  return decimalInteger.pipe(boundedNumber).parse(value);
}

export function parsePagination(query: Record<string, unknown>, defaultLimit: number): { page: number; limit: number; skip: number } {
  const page = boundedInteger(query.page, 1, 1, 10_000);
  const limit = boundedInteger(query.limit, defaultLimit, 1, 50);
  return { page, limit, skip: (page - 1) * limit };
}

export function parsePatientSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const search = z.string().trim().max(100).parse(value);
  return search || undefined;
}
