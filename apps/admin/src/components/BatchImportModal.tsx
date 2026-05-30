/**
 * 模特批量导入弹窗（接口方案 §4.3 POST /admin/models/batch-import）。
 *
 * 链路：选 .xlsx/.xls → 懒加载 xlsx 解析首个 sheet → 逐行映射 + 客户端校验 → 预览 →
 *       仅把合法行发后端 → 展示 ok/error（客户端坏行 + 后端逐行错误合并，标原始行号）。
 *
 * 为什么客户端要先校验：后端 zValidator 校验整个 rows 数组，任一行 schema 不合法会整批 400，
 * 所以坏行（缺编号/化名、编号格式错、数字非整数）在这里就拦下并单独报告，不连累其它行。
 *
 * 列名：中文表头优先，兼容英文 snake_case；数组列用 , ， 、 或空格分隔；布尔列认 是/否/true/1。
 * xlsx 用动态 import，不进主包（仅导入/导出模板时才加载 ~400KB）。
 *
 * 不在导入范围：封面 / 画廊 / 作品集 / 合作历史（媒体后续在模特抽屉里补），
 * 故这些字段一律以空数组提交。
 */
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, X, Check, AlertTriangle, Loader2 } from "lucide-react";
import { AdminApiError, batchImportModels, type AdminCreateModelInput } from "@chiyan/api-client";

const MAX_ROWS = 200; // 与后端 AdminBatchImportRequest.rows.max(200) 对齐

/** 模板列顺序（也是中文表头）。 */
const TEMPLATE_HEADERS = [
  "编号",
  "化名",
  "真名",
  "身高",
  "体重",
  "胸围",
  "腰围",
  "臀围",
  "鞋码",
  "年龄",
  "年龄段",
  "家乡",
  "城市",
  "所在区",
  "QQ",
  "风格",
  "可拍类型",
  "可远程",
  "未成年",
] as const;

const TEMPLATE_EXAMPLE = [
  "M-2024-0001",
  "小柒",
  "张三",
  168,
  48,
  84,
  60,
  88,
  38,
  22,
  "20-25",
  "杭州",
  "杭州",
  "西湖区",
  "12345678",
  "甜美、日系",
  "写真、电商",
  "否",
  "否",
];

/** field → 可接受的表头别名（小写匹配）。 */
const FIELD_ALIASES: Record<string, string[]> = {
  code: ["编号", "code"],
  nickname: ["化名", "昵称", "nickname"],
  real_name: ["真名", "姓名", "real_name"],
  height_cm: ["身高", "height_cm", "height"],
  weight_kg: ["体重", "weight_kg", "weight"],
  bust: ["胸围", "bust"],
  waist: ["腰围", "waist"],
  hip: ["臀围", "hip"],
  shoe_size_eu: ["鞋码", "shoe_size_eu", "shoe"],
  age: ["年龄", "age"],
  age_range: ["年龄段", "age_range"],
  hometown: ["家乡", "hometown"],
  city: ["城市", "city"],
  district: ["所在区", "区", "district"],
  qq: ["qq"],
  style_tags: ["风格", "风格标签", "style_tags", "styles"],
  available_types: ["类型", "可拍类型", "available_types", "types"],
  can_remote: ["可远程", "远程", "can_remote"],
  is_minor: ["未成年", "is_minor", "minor"],
};

const NUMERIC_FIELDS: Array<{ key: keyof AdminCreateModelInput; label: string }> = [
  { key: "height_cm", label: "身高" },
  { key: "weight_kg", label: "体重" },
  { key: "bust", label: "胸围" },
  { key: "age", label: "年龄" },
];

interface ParsedRow {
  rowNo: number; // 原始表格行号（表头算第 1 行，数据从第 2 行起）
  label: string; // 展示用
  input?: AdminCreateModelInput;
  error?: string; // 客户端校验失败原因
}

const CODE_RE = /^M-\d{4}-\d{4}$/;
const TRUE_SET = new Set(["是", "y", "yes", "true", "1", "t", "✓"]);

function normalizeRow(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = v == null ? "" : String(v).trim();
  }
  return out;
}

function pick(norm: Record<string, string>, field: string): string {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    const v = norm[alias.toLowerCase()];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function splitList(s: string): string[] {
  return s
    .split(/[,，、\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toBool(s: string): boolean {
  return TRUE_SET.has(s.toLowerCase());
}

/** 把一行原始对象映射成可提交的 input；坏行返回 error。 */
function buildRow(raw: Record<string, unknown>, rowNo: number): ParsedRow {
  const norm = normalizeRow(raw);
  const code = pick(norm, "code");
  const nickname = pick(norm, "nickname");
  const label = code || nickname || `第 ${rowNo} 行`;

  if (!code) return { rowNo, label, error: "缺少编号" };
  if (!CODE_RE.test(code)) return { rowNo, label, error: `编号格式应为 M-YYYY-NNNN：${code}` };
  if (!nickname) return { rowNo, label, error: "缺少化名" };

  const input: AdminCreateModelInput = {
    code,
    nickname,
    style_tags: splitList(pick(norm, "style_tags")),
    available_types: splitList(pick(norm, "available_types")),
    can_remote: toBool(pick(norm, "can_remote")),
    is_minor: toBool(pick(norm, "is_minor")),
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
  };

  // 选填字段动态回填（AdminCreateModelInput 无索引签名，统一经 unknown 过一道）。
  const mut = input as unknown as Record<string, unknown>;
  for (const { key, label: fieldLabel } of NUMERIC_FIELDS) {
    const raw2 = pick(norm, key);
    if (raw2 === "") continue;
    const n = Number(raw2);
    if (!Number.isInteger(n)) return { rowNo, label, error: `${fieldLabel}应为整数：${raw2}` };
    mut[key] = n;
  }

  for (const strField of [
    "real_name",
    "age_range",
    "hometown",
    "city",
    "district",
    "qq",
  ] as const) {
    const v = pick(norm, strField);
    if (v) mut[strField] = v;
  }

  return { rowNo, label, input };
}

export function BatchImportModal({
  accessToken,
  onClose,
  onImported,
}: {
  accessToken: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<{
    ok: number;
    failures: Array<{ rowNo: number; label: string; reason: string }>;
  } | null>(null);

  const validRows = parsed?.filter((p) => p.input) ?? [];
  const invalidRows = parsed?.filter((p) => p.error) ?? [];

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setParsed(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("空文件");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
        defval: "",
      });
      if (rows.length === 0) {
        setError("表格里没有数据行（第一行需是表头）");
        return;
      }
      if (rows.length > MAX_ROWS) {
        setError(`单次最多导入 ${MAX_ROWS} 行，当前 ${rows.length} 行，请拆分`);
        return;
      }
      setParsed(rows.map((r, i) => buildRow(r, i + 2)));
    } catch (e) {
      setError(e instanceof Error ? `解析失败：${e.message}` : "解析失败");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0 || importing) return;
    setImporting(true);
    setError(null);
    try {
      const res = await batchImportModels(
        validRows.map((p) => p.input!),
        accessToken,
      );
      // 后端 row_index 对应 validRows 下标 → 回填原始行号
      const failures = [
        ...invalidRows.map((p) => ({ rowNo: p.rowNo, label: p.label, reason: p.error! })),
        ...res.errors.map((e) => {
          const src = validRows[e.row_index];
          return {
            rowNo: src?.rowNo ?? e.row_index,
            label: src?.label ?? "—",
            reason: e.code === 40901 ? `编号已存在：${src?.label ?? ""}` : e.message,
          };
        }),
      ].sort((a, b) => a.rowNo - b.rowNo);
      setResult({ ok: res.ok_count, failures });
      if (res.ok_count > 0) onImported();
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], TEMPLATE_EXAMPLE]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "模特");
    XLSX.writeFile(wb, "模特导入模板.xlsx");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">批量导入模特</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--fg)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && (
            <div className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* 结果视图 */}
          {result ? (
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm">
                <Check className="w-4 h-4 text-green-600" />
                成功导入 <strong>{result.ok}</strong> 条
                {result.failures.length > 0 && (
                  <>
                    · <span className="text-[var(--danger)]">{result.failures.length} 条失败</span>
                  </>
                )}
              </div>
              {result.failures.length > 0 && (
                <div className="rounded-md border border-[var(--border)] divide-y divide-[var(--border)] text-sm max-h-60 overflow-y-auto">
                  {result.failures.map((f, i) => (
                    <div key={i} className="px-3 py-2 flex gap-2">
                      <span className="text-[var(--muted)] font-mono shrink-0">行{f.rowNo}</span>
                      <span className="text-[var(--danger)]">{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-4">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium"
                >
                  完成
                </button>
              </div>
            </div>
          ) : parsed ? (
            /* 预览视图 */
            <div>
              <p className="text-sm text-[var(--muted)] mb-3">
                <span className="text-[var(--fg)]">{fileName}</span> · 解析到 {parsed.length} 行，
                <span className="text-green-600">{validRows.length} 行可导入</span>
                {invalidRows.length > 0 && (
                  <span className="text-[var(--danger)]">，{invalidRows.length} 行有问题</span>
                )}
              </p>
              <div className="rounded-md border border-[var(--border)] divide-y divide-[var(--border)] text-sm max-h-64 overflow-y-auto">
                {parsed.map((p) => (
                  <div key={p.rowNo} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-[var(--muted)] font-mono shrink-0 w-12">行{p.rowNo}</span>
                    {p.error ? (
                      <span className="text-[var(--danger)] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {p.error}
                      </span>
                    ) : (
                      <span className="truncate">
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {p.input!.code}
                        </span>
                        <span className="ml-2">{p.input!.nickname}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => {
                    setParsed(null);
                    setFileName("");
                  }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)]"
                >
                  重新选择
                </button>
                <button
                  onClick={handleImport}
                  disabled={validRows.length === 0 || importing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
                >
                  {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {importing ? "导入中…" : `导入 ${validRows.length} 条`}
                </button>
              </div>
            </div>
          ) : (
            /* 选择文件视图 */
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                className="w-full rounded-lg border-2 border-dashed border-[var(--border)] py-10 flex flex-col items-center gap-2 text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)] transition-colors disabled:opacity-50"
              >
                {parsing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
                <span className="text-sm">
                  {parsing ? "解析中…" : "选择 Excel 文件（.xlsx / .xls）"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = ""; // 允许重选同名文件
                }}
              />
              <div className="mt-4 text-xs text-[var(--muted)] space-y-1.5">
                <p>· 第一行为表头，列名见模板（编号 / 化名 必填，编号格式 M-YYYY-NNNN）。</p>
                <p>· 风格 / 可拍类型用顿号或逗号分隔；可远程 / 未成年填"是/否"。</p>
                <p>· 封面与画廊不在导入范围，导入后到模特详情里补图。</p>
                <button
                  onClick={() => void downloadTemplate()}
                  className="inline-flex items-center gap-1.5 mt-1 text-[var(--fg)] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载导入模板
                </button>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                单次最多 {MAX_ROWS} 行
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
