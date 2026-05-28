import { z } from "zod";

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
