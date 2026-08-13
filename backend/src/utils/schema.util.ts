import type { ZodType } from 'zod';
import type { ApiFieldIssue } from '@leviosa/shared';
import { ApiErrors } from './api-error.util.js';

const ROOT_PATH_LABEL = '(root)';

/**
 * The single bridge between Zod and the API error envelope. Validation failures are
 * reported field by field so the client can attach messages to inputs instead of
 * showing one opaque banner.
 */
export const Schema = Object.freeze({
  parse<TOutput>(schema: ZodType<TOutput>, payload: unknown, context: string): TOutput {
    const result = schema.safeParse(payload);
    if (result.success) {
      return result.data;
    }

    const issues: ApiFieldIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : ROOT_PATH_LABEL,
      message: issue.message,
    }));

    throw ApiErrors.validation(`Invalid ${context}.`, issues);
  },
});
