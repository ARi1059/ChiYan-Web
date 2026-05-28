/**
 * 全 API 共享：响应包装、错误码、分页查询。
 *
 * 对应接口方案 §4.1 统一响应格式 + §5.1 分页 + §5.3 错误码。
 */
import { z } from "zod";

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** 接口方案 §5.3 错误码表。子码（业务细分）放 data.sub_code。 */
export const ERROR_CODES = {
  ok: 0,
  bad_request: 40001,
  unauthorized: 40101,
  forbidden: 40301,
  not_found: 40401,
  conflict: 40901,
  gone: 41001,
  too_many_requests: 42901,
  internal: 50001,
  bad_gateway: 50301,
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface SuccessEnvelope<T> {
  code: 0;
  message: string;
  data: T;
  request_id: string;
  timestamp: number;
}

export interface ErrorEnvelope {
  code: Exclude<ErrorCode, 0>;
  message: string;
  data?: { sub_code?: string; [k: string]: unknown };
  request_id: string;
  timestamp: number;
}

/**
 * 包装一个 data schema 成完整响应 envelope。
 * apps/admin 用：`wrap(LoginResponse).parse(json)` 拿到强类型 data。
 */
export const wrap = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    code: z.literal(0),
    message: z.string(),
    data,
    request_id: z.string(),
    timestamp: z.number().int(),
  });

/** 兼容旧导出：apps/admin 已用过 ApiError，保留并放宽 code 为 number。 */
export const ApiError = z.object({
  code: z.number().int(),
  message: z.string(),
  request_id: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
