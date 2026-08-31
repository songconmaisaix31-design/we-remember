# 都记得 / We Remember

We Remember 是一个隐私优先的家庭日程与责任协作 Demo。它解决的不是“把事情记下来”，而是家庭事务中经常缺失的责任闭环：谁发现问题、谁持续记得、谁安排执行、谁真正完成，以及责任如何在家人之间经过确认后交接。

当前版本面向黑客松演示，提供可运行的本地 Web 应用、确定性的责任领域模块、同源 Demo API，以及独立且默认关闭的机器人通知边界。

## 核心能力

- 对话式日程：文字或浏览器语音输入先生成草稿，只有明确确认后才更新本地时间表。
- 整块责任交接：提议、补充、接受、拒绝和过期均由确定性状态机处理；只有接手人接受后负责人才能改变。
- 隐私与同意：私人表达默认不进入家庭投影，Evidence 与 Consent 分离。
- 家庭视图：Agent、家庭时间表、家人和通知、连接中心共享同一份浏览器内 Demo 状态。
- AI by Her 演示场景：远方照护、下班家庭晚餐、冲突后重新沟通。
- 用户名入口：只保存同一标签页内的本地展示会话，不是账户、身份或权限证明。

## 快速开始

要求：Node.js 24+、npm 11+、Python 3.13+。

```powershell
git clone https://github.com/songconmaisaix31-design/New-gethe-point.git
cd New-gethe-point
npm ci
npm ci --prefix modules/robot
npm run dev
```

打开：

```text
http://127.0.0.1:4173/
```

输入任意 1–24 字符的用户名即可进入。本地会话最多保留 12 小时，只用于页面显示，不会传给 API，也不会改变固定 Responsibility Fixture 的 actor。

## 最短演示路径

1. 输入用户名进入 Agent。
2. 点击“远方照护父母”，查看责任建议和隐私边界。
3. 点击“下班家庭晚餐”，查看未确认、未同步的菜单与分工草稿。
4. 点击“重新沟通边界”，查看默认私密且尚未分享的沟通整理。
5. 输入一个带时间的家庭安排，确认草稿后切换到“家庭时间表”和“家人和通知”，观察本地状态同步。

演示数据均为固定 Fixture。页面不代表医疗或心理服务、真实身份、日历持久化、外部消息投递、家人已读或事情已经完成。

## 项目结构

```text
app/                         Static browser application and visual assets
api/                         Vercel serverless entry point
contracts/                   External channel transport contract
docs/                        Integration, motion, robot, and implementation notes
modules/responsibility/      Dependency-free responsibility domain and local server
modules/robot/               Isolated AgiBot A3 notification adapter
scripts/                     Structural and browser verification tools
PRD.md                       Product scope and acceptance criteria
Tech-Spec.md                 Architecture and implementation decisions
API-CONTRACT.md              Production-facing API and identity boundaries
```

根目录只提供统一的工程命令；两个领域模块保留各自的实现边界，没有引入额外应用框架或运行时依赖。

## 常用命令

| Command | Purpose |
| --- | --- |
| `npm run dev` | 启动静态应用与同源 Responsibility Demo API |
| `npm run check` | 运行应用结构、语法、责任域、机器人类型和机器人测试 |
| `npm test` | 运行责任域与机器人测试 |
| `npm run test:http` | 运行聚焦 HTTP/API 测试 |
| `npm run demo` | 执行确定性责任交接 Golden Demo |
| `npm run ci` | 执行提交前与 CI 使用的完整本地门禁 |

## 架构与事实来源

- 产品目标和验收标准：[PRD.md](PRD.md)
- 技术架构和验证策略：[Tech-Spec.md](Tech-Spec.md)
- API、身份与外部边界：[API-CONTRACT.md](API-CONTRACT.md)
- Responsibility 模块：[modules/responsibility/README.md](modules/responsibility/README.md)
- Robot 模块：[modules/robot/README.md](modules/robot/README.md)
- 渠道集成边界：[docs/integration-gateway.md](docs/integration-gateway.md)
- 贡献规则：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)

`HANDOFF.md` 是历史交接材料，不是当前分支、SHA、部署状态或验收结果的事实来源。

## 验证与 CI

GitHub Actions 在 push 和 pull request 上使用 Node.js 24 与 Python 3.13 执行：

```powershell
npm ci
npm ci --prefix modules/robot
npm run ci
```

UI 变更还需要真实浏览器验证。当前验收基准包含 1440×1000 桌面视口和 390×844 移动视口，并检查文字溢出、元素重叠、焦点、登录恢复、运行时过期、退出和核心确认路径。

## 生产边界

当前仓库证明的是黑客松范围内的可运行交互、确定性内存状态转换和安全边界设计，不是生产系统。上线真实用户前仍需补齐：

- 服务端认证、授权、撤销和持久会话；
- 数据库事务、持久化、迁移、备份和恢复；
- 真实通知 outbox、重试、审计与撤回；
- AI provider 数据治理和人工降级；
- 上传处理、监控、限流和生产安全评审；
- 机器人实机协议、安全限制和现场验证。

## License

项目代码使用 [MIT License](LICENSE)。第三方或衍生视觉资产可能有独立署名要求，外部分发前必须核对相应资产说明。
