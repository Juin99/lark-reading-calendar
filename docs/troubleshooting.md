# 常见问题

## 飞书群没有收到消息

检查：

- `FEISHU_WEBHOOK_URL` 是否正确。
- 飞书机器人是否开启了关键词安全校验。
- 如果开启关键词校验，`FEISHU_SECURITY_KEYWORD` 是否匹配。
- CloudBase 函数日志里是否有 `Feishu webhook failed`。

## 返回 unauthorized

检查请求里是否带了正确的 `INTAKE_SECRET`。

支持三种方式：

```text
JSON body: secret
Header: X-Intake-Secret
Header: Authorization: Bearer YOUR_INTAKE_SECRET
```

## 日历没有创建

检查：

- 是否已经打开 `auth_start` 完成飞书 OAuth 授权。
- 状态接口里 `calendarAuth.authorized` 是否为 `true`。
- 飞书应用是否有日历权限。
- `BATCH_SIZE` 是否已经达到。

## 多维表没有写入

检查：

- 是否配置 `FEISHU_BASE_APP_TOKEN`。
- 是否配置 `FEISHU_BASE_TABLE_ID`。
- 飞书应用是否有 `base:app:update`。
- 是否重新 OAuth 授权。
- 状态接口里 `calendarAuth.baseScopeReady` 是否为 `true`。
- CloudBase item 里的 `baseSyncStatus` 和 `baseSyncError`。

## 同一条消息重复进入队列

如果使用机器人入口，请传 `messageId`。云函数会用：

```text
source + messageId
```

生成去重键。

快捷指令入口通常没有稳定消息 ID，因此复制同一段文本多次运行会被当作多条内容。

## 标题识别失败

标题识别是尽力执行：

- 公众号文章通常依赖网页 `og:title`。
- B 站短链会尝试展开。
- 小红书受登录态和风控影响较大。

可以用预览接口测试：

```bash
curl 'YOUR_CLOUDBASE_HTTP_URL?action=metadata_preview&secret=YOUR_INTAKE_SECRET&text=链接'
```
