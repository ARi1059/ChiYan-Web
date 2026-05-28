/**
 * 跨表共用的列类型和帮助函数。
 *
 * bytea：Drizzle pg-core 0.38 未直接导出 bytea，用 customType。
 * 加密字段落库布局：[version: 1B][iv: 12B][ciphertext + GCM tag]
 */
import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});
