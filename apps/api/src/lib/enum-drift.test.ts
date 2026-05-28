/**
 * enum 漂移防护：packages/db 是 source of truth，packages/types 从 db re-export。
 *
 * 这里做运行时 deep-equal 兜底：万一 types 包不小心改成自己 hard-code 一份字面量
 * （比如重构时手抖），CI 这一关挡住。
 *
 * 测试放 apps/api 而不是 packages/types 的原因：apps/api 是同时消费 db + types 的
 * 真实下游，并且 vitest 基建已经在这里搭好；不必给 types 包额外加一套测试运行器。
 */
import { describe, expect, it } from "vitest";
import * as db from "@chiyan/db";
import * as types from "@chiyan/types";

describe("enum drift between @chiyan/db and @chiyan/types", () => {
  it("admin_role values match", () => {
    expect([...types.adminRoleValues]).toEqual([...db.adminRoleValues]);
  });
  it("admin_status values match", () => {
    expect([...types.adminStatusValues]).toEqual([...db.adminStatusValues]);
  });
  it("model_status values match", () => {
    expect([...types.modelStatusValues]).toEqual([...db.modelStatusValues]);
  });
  it("schedule_status values match", () => {
    expect([...types.scheduleStatusValues]).toEqual([...db.scheduleStatusValues]);
  });
  it("media_type values match", () => {
    expect([...types.mediaTypeValues]).toEqual([...db.mediaTypeValues]);
  });
});
