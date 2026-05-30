/**
 * Node 进程入口（systemd ExecStart 指向这里）。
 *
 * 责任：
 *   1. 加载 .env（仅 dev / staging 的本地文件；prod 由 systemd EnvironmentFile 注入，不走 dotenv）
 *   2. zod 校验 env 字段；缺字段早炸
 *   3. 启动 @hono/node-server 监听端口
 *
 * 关键决策：env 校验后作为 `Bindings` 通过 app.fetch(req, env) 的第二参数传入。
 * 业务侧继续读 c.env.X，tests 用 app.request(path, init, ENV) 第三参数注入同形对象。
 *
 * docs：详见 docs/部署架构.md §3.1 (`chiyan-api.service`)。
 */
import "dotenv/config";
import { serve } from "@hono/node-server";
import { createDb } from "@chiyan/db";
import app from "./index";
import { loadEnv } from "./env";
import { setDb } from "./lib/db";
import { ensureStudioSettingsSeed } from "./lib/studio-info-repo";

const env = loadEnv(process.env);
const port = env.PORT ? Number(env.PORT) : 3000;

const db = createDb(env.DATABASE_URL);
setDb(db);
await ensureStudioSettingsSeed();

serve(
  {
    fetch: (req) => app.fetch(req, env),
    port,
  },
  ({ address, port: listenPort }) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "chiyan-api listening",
        address,
        port: listenPort,
        env: env.ENV,
      }),
    );
  },
);
