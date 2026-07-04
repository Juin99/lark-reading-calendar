# 飞书多维表模板

公开模板：

```text
https://juinbase.feishu.cn/base/UqRGbQ8OFazAgrsJ8YJc2mrSnee
```

配套教程：

```text
https://juinbase.feishu.cn/file/B4r9bqHiko0jUkxrhvkcys8xn9c
```

如果你不使用公开模板，也可以手动创建字段。字段名需要和代码保持一致。

机器可读字段定义见：

```text
templates/bitable/fields.json
```

## 字段列表

| 字段名 | 建议类型 | 说明 |
| --- | --- | --- |
| 内容 | 多行文本 | 原始收集内容 |
| 标题 | 文本 | 链接识别出的标题 |
| 链接 | URL | 第一条链接 |
| 平台 | 单选 | wechat / bilibili / xiaohongshu / web / unknown |
| 来源 | 单选 | iOS 快捷指令、OpenClaw、手工测试等 |
| 通道 | 单选 | wechat / test / other |
| 入口 | 文本 | wechat-clipboard / openclaw-wechat / curl |
| 发送人 | 文本 | 机器人入口的发送人 |
| 消息ID | 文本 | 用于去重 |
| CloudBaseItemId | 文本 | CloudBase item `_id` |
| 状态 | 单选 | 待读 / 已排期 / 已读完 / 未读完 / 稍后再读 / 放弃 |
| 收集时间 | 日期 | 入队时间 |
| 批次ID | 文本 | 所属批次 |
| 日历开始 | 日期 | 阅读 block 开始时间 |
| 日历结束 | 日期 | 阅读 block 结束时间 |
| 日历链接 | URL | 飞书日历事件链接 |
| 反馈时间 | 日期 | 用户提交反馈的时间 |
| 阅读反馈 | 单选 | 已读完 / 未读完 / 稍后再读 / 放弃 |
| 备注 | 多行文本 | 反馈备注 |

## 获取 app token 和 table id

多维表 URL 通常包含 `/base/` 后面的 app token。表 ID 可以从表格 API 或 URL/开发者工具中取得。

填入：

```text
FEISHU_BASE_APP_TOKEN
FEISHU_BASE_TABLE_ID
```

## 权限

飞书开放平台应用需要有多维表写入权限，并重新 OAuth 授权。状态接口里的 `baseScopeReady` 为 `true` 后再测试同步。
