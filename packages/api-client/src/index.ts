/**
 * @chiyan/api-client —— H5 + Admin 共享的 API 客户端层。
 *
 * 涵盖：
 *  - admin-client：所有 /api/v1/admin/* 与 /api/v1/auth/login 之外的写路径
 *    （含 AdminApiError、CSRF cookie 读取、媒体三步上传、模特 CRUD、roster、studio-settings PATCH）
 *  - auth-client：/api/v1/auth/login + /auth/login/totp 两步登录
 *
 * 浏览器侧公共逻辑（document.cookie、fetch credentials:'include'、crypto.subtle）；
 * 不依赖任何运行时 framework。
 *
 * 不包含：
 *  - H5 公开端 PublicModelCard → Model shape 转换（仍在 apps/h5/src/lib/api-client.ts，Admin 不需要）
 */
export * from "./admin-client";
export * from "./auth-client";
