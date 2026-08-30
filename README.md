# 《都记得》We Remember P0 交付说明

## 一、项目概述

《都记得》不是普通家庭日历，也不是共享待办。它解决的是家庭中经常被忽略的责任问题：一件事虽然被记录下来，但“谁负责发现问题、记住时间、安排执行、实际完成并跟进结果”仍然不清楚，最终长期压在同一个人身上。

本次交付在已有家庭日程 Agent 基础上，完成了从“记录事件”到“交接整块责任”的核心闭环：

```text
妈妈表达负担
  -> Agent 区分共享事实、私人表达和责任诉求
  -> 生成责任交接建议
  -> 补齐交接信息
  -> 爸爸明确接受
  -> 责任负责人、未来 Todo 和提醒同步迁移
  -> 写入安全 AuditLog，并通知原负责人停止默认提醒
```

只有接手人明确接受后，责任所有权才会变化。提议、补充信息、拒绝或过期都不会偷偷改变负责人。

## 二、交付地址

- 线上 Demo：[https://family.davidwang.space](https://family.davidwang.space)
- Vercel project：`we-remember-family`
- Vercel deployment：`dpl_3iASGQT289jF1EifeoWneZY2nks3`
- Release branch：`songconmaisaix31-design/p0-live-integration-sol`
- Release SHA：`28bb0361cb60903872f7ac3f160b9f3df446f629`
- Remote：`origin/songconmaisaix31-design/p0-live-integration-sol`
- 测试报告：`C:\Users\DW\Desktop\We-Remember-P0-Test-Report-2026-08-30.md`

线上页面和 API 已在 2026-08-30 再次核验：主页返回 HTTP `200`，baseline 责任负责人为 `mother`，交接状态为 `draft`。

## 三、问题与方案

### 3.1 原问题

原有产品已经可以通过文字或语音创建日程、确认参与人和提醒对象，但仍有四个根本缺口：

1. Event 只能描述“什么时候发生什么”，不能表示谁对整件事负责到底。
2. Todo 只能描述下一步动作，不能代表长期责任所有权。
3. 提醒对象与负责人分散保存，交接后容易出现负责人变了、提醒没有迁移的问题。
4. 私人表达、家庭可共享事实和责任诉求混在一起，可能把一个人的压力或隐私暴露给其他家庭成员。

### 3.2 交付方案

本次实现增加了五个明确的数据边界：

| 对象 | 解决的问题 |
| --- | --- |
| `ResponsibilityDomain` | 定义整块家庭责任及唯一人类负责人 |
| `Todo` | 定义可执行的下一步动作及实际执行人 |
| `Handover` | 定义责任从 A 到 B 的双向确认过程 |
| `Evidence` / `Consent` | 控制私人信息何时可以进入家庭共享层 |
| `ReminderPlan` / `AuditLog` | 根据真实责任来源迁移提醒，并记录安全审计证据 |

系统采用确定性规则处理权限、状态机、版本冲突、幂等、提醒路由和原子迁移。AI 只负责输出严格 Schema 约束下的建议，不能直接更改负责人、越权查看私人内容或执行任意命令。

## 四、现场完成内容

### 4.1 可直接演示的 Web 产品

已交付一个中文、响应式、无前端框架依赖的家庭日程与责任交接 Demo，包含：

- Agent 对话：文字输入、浏览器语音听写、日程草稿与确认。
- 家庭时间表：按日期和成员查看共享日程。
- 家人与通知：6 位家庭成员、渠道状态和本地通知回执。
- 连接中心：企业微信、个人微信 ClawBot、飞书、钉钉和自定义 Bot 的演示入口。
- 责任交接区：负责人、交接状态、下一步执行人、默认提醒对象和流程状态。
- 妈妈、爸爸、奶奶三种演示视角。
- 接受、拒绝、接受后完成 Todo、重置四条交互路径。

### 4.2 责任所有权引擎

已完成依赖为零的 `modules/responsibility/` 领域模块：

- 责任域、成员、Todo、交接、证据、Consent、提醒和 AuditLog 合同。
- `draft -> pending_info -> pending_ack -> accepted / declined / expired` 交接状态机。
- 唯一、同家庭、有效人类负责人约束；Agent 不能成为责任负责人。
- 接受交接时，在同一个不可变 next-state 中完成 Owner、未来 Todo、提醒、AuditLog 和旧负责人通知更新。
- Todo 完成后终止对应提醒，不会复活终态提醒。
- 乐观版本检查、闭集命令、严格 ISO 日历校验和幂等重放。
- 同一 ID 对应多个成员、跨家庭数据或不明确身份时 fail closed。

### 4.3 隐私与 AI 边界

已实现：

- 私人表达默认只对本人可见。
- 只有 Evidence 本人可以授予或撤回家庭共享 Consent。
- 家庭投影不会包含未授权的私人表达。
- 爸爸视角不能调用妈妈的私人分析，公网验证返回 `403`。
- AI 输出必须通过闭集 Schema 校验；无效输出只重试一次，仍失败则进入人工确认，不提交状态。
- 责任建议不能猜测缺失事实，也不能把 Agent 或其他家庭成员错误选为负责人。

### 4.4 同源 API 与 Vercel 上线

已完成：

- 浏览器页面与 `/api/responsibility` 同源联调。
- Vercel Serverless API 请求体上限 `16 KiB`。
- 每次线上请求都通过真实 Store/Service 重放有界 Fixture，不依赖 serverless 实例内存存活。
- `Cache-Control: no-store`、`Referrer-Policy: no-referrer`、`nosniff` 和禁止 iframe 等基础响应头。
- `.vercelignore` 排除项目记忆、PRD、截图、测试、脚本和机器人源码，部署包从 102 个文件 / 3.2 MB 缩减到 49 个文件 / 267 KB。
- `family.davidwang.space` 已完成 Vercel 域名验证和 DNS 配置。

### 4.5 辅助交付

仓库还包含两组可继续集成、但不属于当前线上核心链路的成果：

- `modules/robot/`：默认关闭的 AgiBot A3 语音通知适配器；机器人广播不作为成员已收到或任务已完成的证据。
- `app/assets/family-work/`：6 个家庭角色的 family/work 静态 SVG 资产，用于人物视觉表达。

## 五、现场演示方式

### 5.1 最短演示路径

1. 打开 [https://family.davidwang.space](https://family.davidwang.space)。
2. 保持在“Agent”页面。
3. 点击示例指令“演示责任交接”，或输入：

   ```text
   奶奶复诊的安排一直由我负责，我有点撑不住了，想请爸爸完整接手
   ```

4. 查看责任 Agent 返回的“可共享事实、私人表达、责任诉求、建议接手人”。
5. 点击“生成提案并演示双方接受”，或在责任交接区点击“运行接受流程”。
6. 核对页面结果：

   - 责任负责人：爸爸
   - 交接状态：已接受
   - 下一步执行：爸爸
   - 默认提醒：爸爸
   - 妈妈视角出现停止默认提醒的通知

7. 切换妈妈、爸爸、奶奶视角，确认不同成员只能看到各自被授权的数据。
8. 点击“重置”恢复 baseline，再分别演示“拒绝”和“接受并完成下一步”。

### 5.2 演示时应说明

- 这是黑客松交付版，数据是固定 Fixture，不是真实家庭数据。
- 每次操作都重放完整流程，因此刷新或下一次请求不会保存上一次结果。
- 页面视角切换用于展示隐私投影，不代表真实登录或身份认证。
- 页面展示的是责任迁移规则，不代表已经向微信、飞书、钉钉或机器人真实投递消息。

## 六、本地运行与验证

### 6.1 获取交付分支

建议在干净目录中使用 release branch：

```powershell
git clone https://github.com/songconmaisaix31-design/New-gethe-point.git
cd New-gethe-point
git switch --track origin/songconmaisaix31-design/p0-live-integration-sol
git rev-parse HEAD
```

期望 HEAD：

```text
28bb0361cb60903872f7ac3f160b9f3df446f629
```

### 6.2 启动同源 Demo

要求 Node.js 24+。不需要安装 Web 运行时依赖：

```powershell
npm --prefix modules/responsibility start
```

打开：

```text
http://127.0.0.1:4173/
```

该命令同时提供静态页面和本地责任 API，避免使用普通静态服务器时 `/api/responsibility` 不存在。

### 6.3 运行核心检查

```powershell
npm --prefix modules/responsibility run check
npm --prefix modules/responsibility run demo
npm --prefix modules/responsibility run test:http
python -B scripts/verify_app.py
node --check app/app.js
node --check scripts/browser_qa.mjs
git diff --check
```

机器人模块独立验证：

```powershell
cd modules/robot
npm ci
npm run check
npm test
```

真机 A3 测试需要明确的部署配置和现场操作员，不属于默认验证命令。

## 七、验收结果

| 验收项 | 结果 |
| --- | --- |
| Responsibility 单元与集成测试 | `147/147` 通过（当前 release） |
| 最终安全修复聚焦回归 | `40/40` 通过 |
| HTTP/API smoke | `4/4` 通过 |
| Robot tests | `11/11` 通过 |
| Robot TypeScript check | 通过 |
| Golden Demo | 通过 |
| App 结构与 JavaScript 语法 | 通过 |
| 本地同源 smoke | 通过 |
| Vercel 公网 smoke | 通过 |
| 公网主页 | HTTP `200` |
| Owner / Todo / Reminder 迁移 | 妈妈 -> 爸爸，通过 |
| 爸爸私人 Evidence | `0`，通过 |
| 爸爸调用妈妈私人分析 | HTTP `403`，通过 |
| Release branch 本地/远端 SHA | 一致，`28bb036` |

证据边界：当前 release 已重新执行完整 Responsibility 套件并通过 `147/147`，同时通过 `4/4` HTTP smoke、Golden Demo 和结构/语法检查。`40/40` 是部署时的聚焦安全回归记录；黑客松时限内仍未执行完整 fuzz 和广泛对抗测试，因此不能将本表解释为生产安全认证。

Brand assets live under `app/assets/brand/`. `we-remember-logo.svg` is the static, path-only application logo. `mom-to-we-remember.svg` plays once as the full-screen page opening and resolves into the same two-line wordmark with an orange `mem` center; `remomber-to-remember.svg` remains a separate typo-correction animation. Reduced-motion users skip the page opening and see the application immediately.

## 八、系统结构

```text
Browser
  |-- Agent / Schedule / Family / Connections UI
  `-- Responsibility handover demo
        -> /api/responsibility
             -> stateless Fixture replay
             -> Responsibility Service
             -> optimistic in-memory Store
             |-- domain and ownership rules
             |-- handover lifecycle and acceptance
             |-- reminder routing
             |-- consent-safe projection
             `-- strict AI suggestion boundary
```

关键目录：

| 路径 | 用途 |
| --- | --- |
| `app/` | 中文 Web Demo、样式、交互和家庭角色资产 |
| `api/responsibility.mjs` | Vercel Serverless API 入口 |
| `modules/responsibility/` | 责任域、交接、隐私、提醒、Store、Service 和测试 |
| `modules/robot/` | 独立的 A3 语音通知适配器 |
| `contracts/` | 渠道网关合同 |
| `docs/` | 集成、安全、动效和运行说明 |
| `vercel.json` | 线上路由与安全响应头 |

## 九、交付边界与剩余风险

当前交付是可公开演示的黑客松版本，不是生产系统：

- 无数据库持久化；每次 serverless 请求重建 Fixture。
- 无真实账户、家庭身份认证和服务端 Session。
- 无真实微信、飞书、钉钉、日历或机器人通知投递。
- 无真实家庭数据，不能用于生产责任事务。
- 页面视角切换不是权限证明；生产授权必须由服务端身份决定。
- Store 的原子快照证明领域语义，不等于数据库事务保证。
- 全量 fuzz、广泛对抗测试和多浏览器完整视觉回归按黑客松时限推迟。
- 机器人和渠道模块只是隔离适配边界，不属于当前 Vercel 部署包。

本地黑客松演示增加了用户名入口：无需密码，用户名只用于当前页面的显示，不是账户、家庭身份或权限证明。它只在同一浏览器标签页的 `sessionStorage` 中暂存，刷新可恢复，关闭会话、退出或非法数据都会回到登录门；不会传给任何 API，也不会改变 Responsibility Fixture 的固定 `mother` actor。登录后的三个快捷场景分别覆盖远方照护父母、下班家庭晚餐和冲突后重新沟通；它们均为本地交互提示，不代表医疗/心理服务、真实通知或事情已经完成。

这些限制不影响现场展示“责任提议、双方确认、所有权迁移、提醒迁移和隐私投影”的核心产品价值，但在接入真实用户前必须补齐持久化、身份认证、真实通知 outbox、可观测性和生产级事务。
