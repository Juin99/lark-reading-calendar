# 飞书应用设置

## 1. 群机器人

在目标飞书群里添加自定义机器人，并复制 webhook。

填入 CloudBase 环境变量：

```text
FEISHU_WEBHOOK_URL
```

如果机器人开启了关键词安全校验，把关键词填入：

```text
FEISHU_SECURITY_KEYWORD
```

如果没有开启关键词安全校验，保持为空即可。

## 2. 开放平台应用

创建企业自建应用，记录：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
```

## 3. 权限

至少需要日历相关权限，用于：

- 查询忙闲。
- 创建日历事件。
- 获取当前授权用户信息。

如果使用多维表同步，还需要：

```text
base:app:update
```

## 4. OAuth 回调

在飞书开放平台的安全设置里添加重定向 URL：

```text
YOUR_CLOUDBASE_HTTP_URL?action=oauth_callback
```

然后打开：

```text
YOUR_CLOUDBASE_HTTP_URL?action=auth_start&secret=YOUR_INTAKE_SECRET
```

授权成功后，用状态接口确认：

```bash
curl 'YOUR_CLOUDBASE_HTTP_URL?action=status&secret=YOUR_INTAKE_SECRET'
```

重点看：

```json
{
  "calendarAuth": {
    "authorized": true,
    "refreshable": true,
    "freebusyReady": true,
    "baseScopeReady": true
  }
}
```
