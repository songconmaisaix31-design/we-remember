# New-gethe-point 项目交接

> 历史快照：以下内容记录 2026-08-30 的特定工作树状态，不代表当前分支、启动方式或验收结果。

更新时间：2026-08-30

## 1. 当前工作位置

- 工作树：历史 `conversational-schedule-ux` 工作树（本地位置不再作为事实来源）
- 分支：`songconmaisaix31-design/conversational-schedule-ux`
- 交接基线提交：`1f6ef02 Increase page container breathing room`
- 分支状态：交接文档提交前领先远端 6 个提交；包含本交接文档后应领先 7 个提交，尚未推送
- 本地地址：`http://127.0.0.1:4173/app/`

进入工作树后再运行命令，不要在仓库的其他 checkout 中继续修改。

## 2. 产品定位与真实边界

这是一个无框架、无运行时依赖的家庭日程交互原型。核心路径是：

1. 打开 `/app/` 后直接进入 Agent 主页面。
2. 通过文字或浏览器语音向 Agent 描述安排。
3. Agent 先生成草稿，用户明确确认后才写入本页日程。
4. 确认后生成按家庭成员展示的本地通知回执。

默认个人头像使用 `app/assets/family-work/mother/work.svg` 的职场女性 SVG；家人列表和通知对象按妈妈、爸爸、女儿、儿子、奶奶角色使用对应的 `family.svg`。

当前所有日程、家庭成员、通知回执和渠道状态都是浏览器内演示数据。页面不会执行真实日历写入、消息投递、平台收件确认或持久化，也不能把本地回执解释为已送达或已读。

## 3. 已完成页面

- Agent：文字输入、浏览器实时听写、语音自动发送、确认式日程草稿。
- 家庭时间表：摘要、日期筛选、成员筛选、共享日程列表，以及返回 Agent 创建安排的入口。
- 家人和通知：6 位家庭成员、渠道状态、通知回执历史，以及演示证据边界说明。
- 连接中心：企业微信、个人微信 ClawBot、飞书、钉钉和自定义 Bot 的演示连接状态。

四个页面共享同一份浏览器内事件与回执状态。只有 Agent 草稿的明确确认会修改它；筛选操作只改变展示。

## 4. 最近完成的视觉调整

- 主页面最大宽度从 `1460px` 增至 `1600px`。
- 平板单列布局最大宽度增至 `840px`，单列断点提前到 `960px`。
- 时间表、家人和通知主容器使用 `28px` 桌面/平板内边距、`20px` 手机内边距。
- 摘要、日程行、成员行和通知行增加了间距与最小高度。
- 主容器保留抬升、阴影和短时状态反馈；静态信息行不会通过位移动画暗示可点击。
- 手机保持 12px 页面安全边距，底部导航和主要操作可达。
- 路由切换时标题会接收程序化焦点，但不会显示多余的黑色焦点框。
- `app/assets/brand/` 提供静态 Logo 和两套透明品牌 SVG 动画。侧栏固定使用 `we-remember-logo.svg`；进入或刷新网页时只播放一次 `mom-to-we-remember.svg` 全屏开幕动画，结束后移除开幕层并恢复滚动。减少动态效果时直接跳过。

容器、材质、动效和响应式规则的详细清单见 [docs/container-motion-materials.md](../container-motion-materials.md)。

## 5. 启动方式

在工作树根目录运行：

```powershell
python -m http.server 4173
```

然后打开：

```text
http://127.0.0.1:4173/app/
```

语音能力依赖 Chrome 的麦克风权限。`localhost` 和 `127.0.0.1` 可作为浏览器安全上下文使用。

## 6. 验证方式

基础结构和契约检查：

```powershell
python -B scripts/verify_app.py
node --check app/app.js
node --check scripts/browser_qa.mjs
git diff --check
```

浏览器回归使用 `scripts/browser_qa.mjs`，参数格式为：

```powershell
node scripts/browser_qa.mjs <cdp-port> http://127.0.0.1:4173/app/ <width> <height> <screenshot-path> <scenario>
```

本轮已经通过以下真实浏览器尺寸：

- `1440 × 1000`
- `820 × 1180`
- `390 × 844`

覆盖 `schedule` 和 `people` 场景，结果包括：无运行时错误、无页面横向溢出、主操作可达、响应式导航正确、共享状态同步、筛选可用，以及主容器圆角/内边距/抬升反馈有效。

最新截图位于 `outputs/final-schedule-*.png` 和 `outputs/final-people-*.png`。

机器人模块需要单独验证：

```powershell
cd modules/robot
npm ci
npm run check
npm test
```

不要在没有明确设备配置和 `ROBOT_A3_SMOKE_CONFIRM=PLAY_AUDIO_ON_A3` 的情况下运行真实 A3 播放测试。

## 7. 关键文件

- [app/index.html](../../app/index.html)：四个页面、认证入口和连接中心结构。
- [app/styles.css](../../app/styles.css)：视觉系统、容器、动效和响应式布局。
- [app/app.js](../../app/app.js)：浏览器状态、Agent 草稿确认、日程和通知回执同步。
- [PRD.md](../../PRD.md)：产品目标、范围和验收边界。
- [Tech-Spec.md](../../Tech-Spec.md)：技术设计。
- [API-CONTRACT.md](../../API-CONTRACT.md)：未来服务端接口边界。
- [contracts/channel-gateway.openapi.yaml](../../contracts/channel-gateway.openapi.yaml)：自定义 Bot 网关事实来源。
- [docs/integration-gateway.md](../integration-gateway.md)：渠道路由与安全边界。
- [docs/cli-integration-runbook.md](../cli-integration-runbook.md)：本地渠道 CLI 检查流程。
- [docs/robot-a3-integration.md](../robot-a3-integration.md)：A3 适配器和实机测试门禁。

## 8. Git 与未提交内容

交接时工作区仍有两处未提交修改：

```text
M MEMORY.md
M README.md
```

这些改动不是本交接文档创建时新增的内容。后续开发者必须保留并先检查差异，不能使用 `git reset --hard`、`git checkout --` 或其他方式覆盖。

最近与完整家庭页面相关的提交：

```text
1f6ef02 Increase page container breathing room
bdc5ed9 Polish rounded container interactions
6b07bd3 Document complete family application shell
7cf3584 Polish and verify complete family views
ad3912e test: extend family app acceptance coverage
dee4638 Complete family schedule and notifications views
```

## 9. 下一阶段建议顺序

1. 先决定项目继续作为交互原型，还是进入真实产品化；两条路径的数据和安全要求不同。
2. 如果产品化，先以 `API-CONTRACT.md` 为事实来源实现服务端身份、日程草稿、原子确认和持久化，不要直接把浏览器演示状态替换成零散请求。
3. 在真实消息渠道接入前实现授权、可撤销身份绑定、持久 inbox/outbox、幂等、重试和审计；任何平台接受状态都不能自动等同于家人已读或已完成。
4. 每次修改共享容器或动效时同步更新 `docs/container-motion-materials.md`，并重新执行 1440、820、390 三档浏览器回归。
5. 在推送或创建 PR 前，确认 `README.md` 和 `MEMORY.md` 的现有未提交修改归属，再决定是否单独提交。

## 10. 当前验收结论

本地原型的核心路径已经完整：直接进入 Agent、描述安排、确认草稿、查看时间表、查看成员与通知回执、进入连接中心。家庭密钥、头像设置和退出流程已从静态原型移除；生产身份仍以 `API-CONTRACT.md` 为边界。当前可交付的是经过响应式和浏览器验证的本地交互原型，不是具备真实账号、日历、消息渠道和持久化的生产系统。
