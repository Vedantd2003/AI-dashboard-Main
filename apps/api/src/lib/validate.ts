import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors.js';

function parse<S extends ZodTypeAny>(schema: S, value: unknown, where: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest(`Invalid ${where}`, r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.body, 'request body');
export const query = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.query, 'query parameters');
export const params = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.params, 'path parameters');
