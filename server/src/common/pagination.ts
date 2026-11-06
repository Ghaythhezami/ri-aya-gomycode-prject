import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Paginated } from '@riaya/shared';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** `page` (1-based), `limit` (default 20, max 100) and `sort` (`field` or `-field`). */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}

export function resolvePagination(query: { page?: number; limit?: number }) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** `-field` is descending. A field outside `allowed` is a 400, never silently ignored. */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: F,
): { field: F; direction: 'asc' | 'desc' } {
  if (!sort) return { field: fallback, direction: 'asc' };
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '') as F;
  if (!allowed.includes(field)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid sort field',
      details: { sort, allowed },
    });
  }
  return { field, direction };
}

export function paginated<T>(items: T[], page: number, limit: number, total: number): Paginated<T> {
  return { items, page, limit, total };
}
