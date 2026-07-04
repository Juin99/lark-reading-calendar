# Lark Reading Calendar

把微信剪贴板、微信机器人或其他入口收集到的待读内容，自动进入 CloudBase 队列，凑够一组后写入飞书日历，并同步到飞书多维表。

这个项目适合这些场景：

- 在微信里看到文章、视频、笔记，先复制到剪贴板，稍后集中读。
- 用 iPhone 快捷指令一键收集内容。
- 用 OpenClaw / 微信机器人把消息转发到同一个收集入口。
- 凑够 5 条后自动创建一个飞书日历阅读 block。
- 用飞书多维表作为阅读收件箱，记录状态、批次、反馈和备注。

## 灵感来源

这个项目的灵感来自 Zara 的 [`reading-block-lark`](https://github.com/zarazhangrui/reading-block-lark)。原项目展示了一个很清晰的 Reading Block 思路：把零散待读链接收集起来，成批写入飞书日历。

`lark-reading-calendar` 在这个思路上做了另一条技术路线：

- 从浏览器本地插件扩展到 iPhone 快捷指令、微信机器人和 CloudBase。
- 从本机 CLI 路线扩展到云函数 + 飞书开放 API。
- 从本地列表扩展到 CloudBase 队列 + 飞书多维表阅读收件箱。

## 架构

```text
iPhone 快捷指令 / OpenClaw / 手工 curl
          |
          v
CloudBase HTTP 云函数 wechatTaskCollector
          |
          +--> CloudBase 数据库：items / batches / auth
          +--> 飞书群机器人：收集进度和排期通知
          +--> 飞书日历 API：创建阅读 block
          +--> 飞书多维表 API：写入阅读收件箱
          +--> 反馈页：回写阅读状态
```

## 功能

- 接收剪贴板文本、链接或微信机器人消息。
- 支持 `secret` / `X-Intake-Secret` / `Authorization: Bearer` 三种简单鉴权方式。
- 支持按 `source + messageId` 去重。
- 未凑够批次时发送收集进度。
- 凑够 `BATCH_SIZE` 条后创建飞书日历事件。
- 使用飞书忙闲接口优先寻找空闲时间，失败时按工作时间兜底。
- 飞书多维表同步：新建记录、更新排期、回写阅读反馈。
- 日历事件描述中附带反馈页链接。
- 对公众号、B 站、小红书等链接做尽力标题识别。

## 快速开始

完整步骤见 [DEPLOY.md](./DEPLOY.md)。

你需要准备：

1. 腾讯云 CloudBase 环境。
2. 飞书群机器人 webhook。
3. 飞书开放平台应用，开启日历和多维表权限。
4. 飞书多维表模板副本。
5. iPhone 快捷指令模板。

模板入口：

- CloudBase 配置模板：[cloudbaserc.example.json](./cloudbaserc.example.json)
- 快捷指令模板说明：[templates/shortcuts/README.md](./templates/shortcuts/README.md)
- 飞书多维表模板：[Lark Reading Calendar 阅读收件箱模板](https://juinbase.feishu.cn/base/UqRGbQ8OFazAgrsJ8YJc2mrSnee)
- 飞书云文档教程：[Lark Reading Calendar 配置教程.md](https://juinbase.feishu.cn/file/B4r9bqHiko0jUkxrhvkcys8xn9c)
- 多维表字段模板：[templates/bitable/schema.md](./templates/bitable/schema.md)
- 机器可读字段定义：[templates/bitable/fields.json](./templates/bitable/fields.json)

> 快捷指令 iCloud 模板链接待发布后补充。当前仓库先提供完整手动搭建蓝图，避免提交带个人配置的 `.shortcut` 文件。

## HTTP 收集接口

请求方法：`POST`

请求体：

```json
{
  "secret": "YOUR_INTAKE_SECRET",
  "text": "待读内容或链接",
  "source": "ios-shortcut",
  "channel": "wechat",
  "entry": "wechat-clipboard",
  "messageId": "optional-id-for-dedup"
}
```

成功响应示例：

```json
{
  "ok": true
}
```

## 安全提醒

不要公开提交你的真实 `cloudbaserc.json`、飞书 webhook、App Secret、CloudBase envId、快捷指令个人配置或多维表 app token。详见 [SECURITY.md](./SECURITY.md)。

## License

MIT
