# 都记得 / We Remember

We Remember 是一个面向家庭的日程与照护责任协作原型。它不仅记录“什么时候做什么”，也尝试承接家庭成员没有直接说出口的需要：先把照护负担整理成可讨论的责任提案，再由接手人明确确认，最后迁移负责人及后续提醒。

项目当前状态为 **ACTIVE**。它源自 SheNicest 黑客松（未获奖），比赛现场的 Mock 已与赛后继续完善的可运行原型明确分开；详见 [STATUS.md](STATUS.md)。

## 产品主线

- **家庭日程**：文字或浏览器语音输入先形成草稿，只有用户明确确认后才更新浏览器内时间表。
- **照护责任提案**：把待办、责任范围、必要信息和隐私边界整理为可复核提案，不把情绪表达直接公开给全家。
- **接手确认**：补充信息、接受、拒绝和过期均有确定性规则；沉默或提交提案不会自动改变负责人。
- **责任迁移**：只有接手人接受完整提案后，责任归属、符合条件的后续待办和提醒才一起迁移。

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

输入任意 1–24 字符的用户名即可进入。该值只用于当前标签页展示，最多保留 12 小时；它不会传给 API，也不会成为身份、成员 ID 或授权依据。

## 最短演示路径

1. 输入用户名进入 Agent。
2. 点击“远方照护父母”，查看照护责任建议和隐私边界。
3. 点击“下班家庭晚餐”，查看未确认、未同步的菜单与分工草稿。
4. 点击“重新沟通边界”，查看默认私密且尚未分享的沟通整理。
5. 输入一个带时间的家庭安排，确认草稿后切换到“家庭时间表”和“家人和通知”，观察本地状态同步。

演示数据均为虚构 Fixture。页面不代表医疗或心理服务、真实身份、日历持久化、外部消息投递、家人已读或事情已经完成。

## 比赛 Mock 与赛后原型

比赛现场版本使用预设家庭、预设场景、浏览器内状态和模拟通知回执来讲清产品路径。连接中心的渠道卡片、场景文案和页面回执都是 Mock 展示，不证明真实平台接入或送达。

赛后版本在此基础上补充了可本地启动的同源 HTTP 服务，以及经过测试的 Responsibility Store/Service、提案生命周期、接手确认、责任迁移、提醒路由和隐私投影。它仍使用内存状态或每请求重建的固定 Fixture，不是生产后端。

本项目**不会读取个人微信群聊或聊天历史**，也未在本次整理中验证任何生产部署。个人微信相关内容仅描述隔离的、需显式配对的直聊通道边界，不代表群聊权限。We Remember 也不承诺调解或解决所有家庭冲突；它只为具体日程和责任交接提供一条可确认、可追溯的协作路径。

## 贡献说明

家庭 Agent 的方向由团队与多个 AI 系统一起发散形成。用户提出了“识别未说出口的需要”这一机制；另一位团队成员主要负责产品工作；用户主要负责 UI、硬件、代码实现与部分路演。这里描述的是实际分工，不把 AI 生成、调研、Mock 或未验证集成计为已完成产品能力。

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
STATUS.md                    Current status, evidence, and limitations
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
- 历史计划与交接：[docs/history/README.md](docs/history/README.md)
- 贡献规则：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)

## 验证与 CI

GitHub Actions 在 push 和 pull request 上使用 Node.js 24 与 Python 3.13 执行：

```powershell
npm ci
npm ci --prefix modules/robot
npm run ci
```

UI 变更还需要真实浏览器验证。当前验收基准包含 1440×1000 桌面视口和 390×844 移动视口，并检查文字溢出、元素重叠、焦点、登录恢复、运行时过期、退出和核心确认路径。

## 能力边界

当前仓库证明的是本地可运行交互、确定性内存状态转换和安全边界设计，不是生产系统。真实用户使用前仍需补齐：

- 服务端认证、授权、撤销和持久会话；
- 数据库事务、持久化、迁移、备份和恢复；
- 真实通知 outbox、重试、审计与撤回；
- AI provider 数据治理和人工降级；
- 上传处理、监控、限流和生产安全评审；
- 机器人实机协议、安全限制和现场验证。

## License

项目代码使用 [MIT License](LICENSE)。第三方或衍生视觉资产可能有独立署名要求，外部分发前必须核对相应资产说明。
