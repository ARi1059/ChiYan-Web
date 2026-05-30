/**
 * tsup build：把 apps/api 打成单文件 dist/server.js（监听端口的 Node ESM entrypoint）。
 *
 * 关键决策：
 * - target=node22：与 docs/部署架构.md §二 安装的 NodeSource 22.x 对齐
 * - format=esm：保持 package.json "type":"module"
 * - bundle 内联 workspace 包（@chiyan/db, @chiyan/types）——它们 main 指 .ts 源，
 *   plain Node 跑不起来；用 tsup noExternal 把它们打进 dist
 * - native deps 留作 external：pg/bcryptjs/redis/sharp 需要 node_modules 安装
 *   （docs §五 rsync 同时推 node_modules 到 VPS）
 * - sourcemap：上线后线上 stack trace 可反解（排错用）
 * - clean：每次 build 清 dist
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/^@chiyan\//],
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  outDir: "dist",
});
