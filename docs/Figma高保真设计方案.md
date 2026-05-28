# Figma 高保真设计方案

> 版本：v1 · 更新日期：2026-05-25
> 关联文档：[模特资料与当日通告接单-H5设计方案.md](./模特资料与当日通告接单-H5设计方案.md)（v3）
> 适用范围：H5 客户端 + 后台管理系统 双产品的 Figma 高保真稿与设计系统

---

## 〇、本方案是什么

本文档不是设计稿本身，而是**搭建 Figma 高保真稿的工作方案**——回答以下问题：

- Figma 文件如何组织（Pages / Frames / Components / Variables）
- 设计 Tokens 的具体值（与 v3 主方案一致，可直接落变量）
- 需要画哪些屏幕、覆盖哪些状态
- 评审节奏、交付物清单、Dev Mode 对接

---

## 一、目标与交付物

### 1.1 目标

提供**可直接交付开发**的 Figma 高保真稿：组件化、变量化、原型可点、Dev Mode 标注完备，做到设计 → 开发零信息损失。

### 1.2 交付物清单

| # | 交付物 | 说明 |
| --- | --- | --- |
| 1 | Figma File A：**Design System** | 设计系统库（Tokens + Components + Icons） |
| 2 | Figma File B：**H5 Client** | 移动端 H5 全部屏幕 + 原型 |
| 3 | Figma File C：**Admin Console** | 后台管理系统全部屏幕 + 原型 |
| 4 | PDF 静态备份 | 三份 File 的 PDF 导出，归档防 Figma 故障 |
| 5 | 关键流程录屏 | 三条核心动线 GIF/MP4 演示 |
| 6 | Dev Mode 链接 | 开发可直接读切图 / 字号 / 间距 |

### 1.3 时间预估

| 阶段 | 工日 |
| --- | --- |
| 搭建 Design System（Tokens + 基础组件） | 3–4 |
| H5 Client 主链路 + 状态屏 | 5–7 |
| Admin Console 核心模块 | 4–5 |
| 评审、修订、Dev Mode 标注 | 2–3 |
| **总计** | **约 14–19 工日** |

---

## 二、Figma 文件组织

### 2.1 File A：Design System

```
📄 ChiYan · Design System
├─ 🎨 Cover                        ← 封面 + 版本号 + 维护说明
├─ 🪙 Tokens（Variables）
│   ├─ Color / Light
│   ├─ Color / Dark
│   ├─ Typography
│   ├─ Spacing
│   ├─ Radius
│   ├─ Shadow
│   └─ Motion
├─ 🧩 Components / Atoms           ← 按钮、输入、Chip 等
├─ 🧩 Components / Molecules       ← 模特卡片、Segmented、Sheet Header
├─ 🧩 Components / Organisms       ← Tab Bar、Hero、当日通告区
├─ 🧱 Icons（SF Symbols 风格）
├─ 🌑 States / Empty / Error
└─ 📦 Archive                      ← 评审节点归档
```

### 2.2 File B：H5 Client

```
📄 ChiYan · H5 Client
├─ 🎨 Cover
├─ 📱 01 Home
├─ 📱 02 Today（当日通告）
├─ 📱 03 Roster（全部模特）
├─ 📱 04 Contact
├─ 📱 05 Model Detail（Sheet）
├─ 📱 06 Sharing
├─ 📱 07 QQ Interaction
├─ 📱 08 States（加载/空/错误/离线/休息）
├─ 🎬 Prototype Flow
└─ 📦 Assets Export
```

### 2.3 File C：Admin Console

```
📄 ChiYan · Admin Console
├─ 🎨 Cover
├─ 🖥 01 Login & Auth
├─ 🖥 02 Dashboard
├─ 🖥 03 Model Management
├─ 🖥 04 Daily Roster
├─ 🖥 05 Schedule
├─ 🖥 06 Media Library
├─ 🖥 07 Accounts & Permissions
├─ 🖥 08 Audit Log
└─ 🎬 Prototype Flow
```

### 2.4 命名规范

| 类型 | 格式 | 示例 |
| --- | --- | --- |
| Page | `[emoji] [编号] [模块名]` | `📱 02 Today` |
| Frame | `[编号]/[模块]/[状态]` | `02/Today/Empty` |
| Component | `[Type]/[Name]/[Variant]` | `Atoms/Button/Primary` |
| Variable | `[category]/[name]/[mode]` | `color/accent/light` |

### 2.5 版本管理

- 主分支 `main` 每周打 Tag
- 评审节点开独立 Branch：`review/v1`、`review/v2`
- 评审通过后归档到 `📦 Archive` Page
- 重大变更前 Duplicate 文件做快照

---

## 三、Design Tokens（Figma Variables）

> 与 v3 主方案 §二 完全对齐，所有数值不在组件里硬编码。

### 3.1 颜色（Color Variables，Light / Dark 双 Mode）

| Variable | Light | Dark |
| --- | --- | --- |
| `color/bg/primary` | #F7F7F8 | #000000 |
| `color/bg/surface` | #FFFFFF | #1C1C1E |
| `color/text/primary` | #1C1C1E | #FFFFFF |
| `color/text/secondary` | #6C6C70 | #98989F |
| `color/text/tertiary` | #AEAEB2 | #5C5C60 |
| `color/separator` | rgba(60,60,67,0.12) | rgba(84,84,88,0.65) |
| `color/accent` | #8C6A4B（香槟铜） | #B89070 |
| `color/critical` | #A33B3B（浅酒红） | #C76060 |
| `color/success` | #2E7D5B | #46A37A |

> ⏳ 业主 VI 到位后，**只需替换 `color/accent` 与 `color/critical`**，所有引用自动更新。

### 3.2 字体（Text Styles）

| Token | Size / LineHeight / Weight | 用途 |
| --- | --- | --- |
| `text/large-title` | 34 / 41 / Bold | iOS Large Title |
| `text/title-1` | 28 / 34 / Semibold | 板块标题 |
| `text/title-2` | 22 / 28 / Semibold | 卡片主标题 |
| `text/headline` | 17 / 22 / Semibold | 详情子标题 |
| `text/body` | 17 / 22 / Regular | 正文 |
| `text/subhead` | 15 / 20 / Regular | 副文本 |
| `text/footnote` | 13 / 18 / Regular | 卡片副信息 |
| `text/caption-1` | 12 / 16 / Regular | 辅助 |
| `text/caption-2` | 11 / 13 / Regular | 标签 |

字体族 fallback chain：`SF Pro` → `PingFang SC` → `system-ui`

### 3.3 间距 / 圆角 / 阴影 / 动效

```
Spacing:  4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48
Radius:   4 / 8 / 12 / 14 / 20（card）/ 28（pill）
          + Corner Smoothing 60%（模拟 iOS 连续圆角）

Shadow:
  card    0 1px 3px rgba(0,0,0,0.04)
  sheet   0 -8px 24px rgba(0,0,0,0.08)
  modal   0 16px 48px rgba(0,0,0,0.12)

Motion:
  fast    120ms
  normal  250ms
  slow    350ms
  spring  cubic-bezier(0.32, 0.72, 0, 1)
```

---

## 四、组件库

### 4.1 Atoms（10 个）

| # | 组件 | Variants |
| --- | --- | --- |
| 1 | Button | Primary / Secondary / Ghost / Pill · S/M/L · Default/Pressed/Disabled/Loading |
| 2 | Icon Button | 24/32/44pt · 三态 |
| 3 | Chip / Tag | Filled / Outline · Selectable · 可关闭 |
| 4 | Avatar | Round / Square / Group · S/M/L |
| 5 | Badge | Dot / Number / Text |
| 6 | Input Field | Default / Focused / Error / Disabled |
| 7 | Search Bar | iOS 标准（带取消按钮） |
| 8 | Switch | On / Off / Disabled |
| 9 | Separator | hairline 1px / inset |
| 10 | Skeleton / Spinner | 卡片骨架 · 圆 · 行 |

### 4.2 Molecules（12 个）

1. **Model Card**（核心，含 v3 公开字段：化名、身高、体重、三围、鞋码、常驻地、风格）
2. Segmented Control
3. Chip Row（横滚标签行）
4. Sheet Header（grabber + 标题 + 关闭）
5. Top Nav Bar（Compact / Large Title）
6. Tab Bar Item
7. Carousel Indicator
8. Date Banner（自动日期行）
9. Schedule Dot Row（7 天档期点阵）
10. Cooperation Card
11. Toast Banner
12. Empty State Block

### 4.3 Organisms（8 个）

1. Tab Bar（4 项）
2. Hero Banner
3. Today Section（标题 + Segmented + Chips + 卡片网格）
4. Roster Section（搜索 + Segmented + 网格）
5. Model Detail Sheet（轮播 + 档案 + CTA）
6. Share Sheet（自绘底部 Sheet）
7. Browser Switch Hint Card（不受支持浏览器 / 微信内嵌引导卡：「请在 Safari / Chrome / QQ 中打开」）
8. Contact Block

### 4.4 规范

- 全组件强制 **Auto-layout**
- Variants 至少覆盖：State × Theme（Light/Dark）
- 所有 fill / stroke 引用 Variables，禁止硬编码

---

## 五、H5 Client 屏幕清单（约 42 屏）

### 5.1 主流程（28 屏）

| 编号 | 屏幕 | 状态 |
| --- | --- | --- |
| 01-Home | Default · Loading · Error · Offline | 4 |
| 02-Today | Default · Filtered · Empty · 休息日 | 4 |
| 03-Roster | Default · Searching · NoResult | 3 |
| 04-Contact | Default | 1 |
| 05-Detail | Sheet Medium · Sheet Large · Loading · Empty | 4 |
| 06-Share | iOS Native · QQ JSAPI · Fallback Sheet | 3 |
| 07-QQ | Toast Success · Hint Card · Open QQ App · Failure | 4 |
| 08-Topnav 滚动态 | Large → Compact 过渡帧 | 2 |
| **小计** | | **26** |

### 5.2 状态屏（10 屏）

加载骨架 · 空 · 错误 · 离线 · 当日休息 · 未成年屏蔽 · QQ 已复制 · 网络弱 · 接口超时 · 接口降级

### 5.3 模态 / Toast（4 屏）

预约 Toast · 复制成功 · 错误 Toast · 网络异常 Banner

### 5.4 适配尺寸

每个主链路屏需出 **双尺寸**：
- iPhone 14 Pro：390 × 844（基准）
- iPhone SE：375 × 667（小屏验证）

横屏 / iPad 走响应式自动延伸，不单独出稿。

---

## 六、Admin Console 屏幕清单（约 30 屏）

基准尺寸 **1440 × 900**，最小兼容 **1024**：

| 模块 | 屏幕 |
| --- | --- |
| 登录 | Login · 2FA · Password Reset |
| Dashboard | 总览（PV / UV / 模特热度 / 今日在班数） |
| 模特管理 | 列表 · 详情 · 新增 · 编辑 · 删除确认 · 批量上传 · 归档 |
| 当日名单 | 拖拽编辑 · 时间预设 · 历史 |
| 档期 | 7 天日历 · 单模特日历视图 |
| 媒体库 | 网格 · 上传 · 裁剪 · 水印预览 |
| 账号 | 管理员列表 · 角色 · 邀请 · 禁用 |
| 审计 | 日志列表 · 详情 · 筛选 |

---

## 七、原型（Prototype）

### 7.1 核心动线（必做）

1. **首页 → 当日通告 → 模特详情 → QQ 接单**（主转化链路）
2. **全部模特 → 搜索 → 详情 → 分享**
3. **首页 → 联系 Tab → 一键 QQ**
4. **后台：登录 → Dashboard → 编辑模特 → 上传图片 → 发布 → CDN 刷新提示**

### 7.2 动效（Smart Animate）

| 场景 | 时长 | 曲线 |
| --- | --- | --- |
| Sheet 弹出 / 关闭 | 250ms | spring |
| Tab 切换 | 120ms | ease-out |
| 卡片点击 | 120ms scale 0.97 → Sheet | spring |
| Toast 出现 / 消失 | 200ms / 300ms | ease |
| 顶部 Large → Compact | 跟随滚动 | linear |

### 7.3 演示设备

- 移动：iPhone 14 Pro
- 桌面：MacBook Pro 14"

---

## 八、Dev Mode 与切图

### 8.1 配置

- 开启 **Dev Mode**，开发账号设为 Viewer
- 启用 Code Connect（如有 GitHub 集成）
- 度量单位：px + rem 双显示
- 颜色：hex + variable name 双显示

### 8.2 切图规范

| 资源 | 格式 | 倍率 |
| --- | --- | --- |
| 图标 | SVG | 1x（矢量） |
| 装饰图 | PNG | @2x / @3x |
| 模特封面 | 占位图 | 实际由后台上传，Figma 用 placeholder |

命名：`icon-[name].svg`、`bg-[scene]@2x.png`

### 8.3 字体

不导出。开发侧统一用 fallback chain：`SF Pro` → `PingFang SC` → `system-ui`。

---

## 九、协作流程

### 9.1 角色

| 角色 | 职责 |
| --- | --- |
| 设计师 | 搭建系统、出稿、维护 Figma |
| 业主 / 经纪人 | 核心动线评审、视觉调性确认 |
| 开发 | Day 9 起介入 Dev Mode 评估可实现性 |

### 9.2 评审节点

| 节点 | 内容 | 决策点 |
| --- | --- | --- |
| Day 4 | Design System + 首页 Hero | 视觉调性 |
| Day 9 | H5 完整主链路 + 状态屏 | IA、交互、QQ 接单体验 |
| Day 14 | 后台核心模块 | 后台易用性 |
| Day 17 | 整体走查 + Dev Mode 就绪 | 交付 |

### 9.3 验收标准

- ✅ 所有 Frame 使用 Variables，无硬编码颜色 / 字号 / 间距
- ✅ 所有组件有 Variants 覆盖 State × Theme
- ✅ 主链路原型可点击演示，含 Smart Animate 动效
- ✅ Dev Mode 切图、字号、间距、阴影标注完备
- ✅ 三个 Figma File 链接 + PDF 备份提交
- ✅ 关键流程录屏 ≥ 3 条

---

## 十、风险与备选

| 风险 | 备选 |
| --- | --- |
| 业主品牌 VI 未到位 | 暂用方案默认色，accent / critical 用 token 名引用，VI 到位后单点替换 |
| iOS 连续圆角在 Figma 还原度有限 | `Corner Smoothing 60%` 近似，开发实现用 `border-radius` + figma-squircle 或 SVG mask |
| QQ 多 scheme 在 Figma 仅可示意 | 用占位提示 + 文字说明，真实跳转留给开发联调 |
| 设计周期吃紧 | 后台拆 P0（模特 + 名单）+ P1（媒体 + 审计），P1 后置出稿 |
| Dark Mode 视觉调校耗时 | Light Mode 优先冻结，Dark Mode 在评审 Day 14 后集中调一次 |

---

## 十一、下一步

1. 建立三个 Figma File，搭建 Tokens 与 Atoms（Day 1–2）
2. 完成首页 Hero + Model Card 原子组合，约 Day 4 走第一轮评审
3. 后台接口设计方案同步推进（见 [后台管理系统接口设计方案.md](./后台管理系统接口设计方案.md)），Day 9 评审时业主可同时看到客户端 + 后台

---

> 文档维护：本方案为 Figma 工作指引，不含具体设计像素稿。所有像素决策在 Figma 中作出，本文档仅提供框架与对齐基准。
