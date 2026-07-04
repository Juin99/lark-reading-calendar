# 快捷指令模板

模板位置：

```text
templates/shortcuts/LarkReadingCalendar-Setup.shortcut
```

> 当前仓库提供完整模板规格和手动搭建步骤。可导入 `.shortcut` 文件需要由 Shortcuts App 生成并签名，发布前请确认它不包含任何真实 URL 或 secret。

## 首次运行配置逻辑

首次运行时询问：

- CloudBase HTTP URL
- `INTAKE_SECRET`

保存为配置文件：

```text
iCloud Drive/Shortcuts/lark-reading-calendar-config.json
```

配置文件内容：

```json
{
  "cloudbaseUrl": "https://YOUR_CLOUDBASE_HTTP_URL",
  "secret": "YOUR_INTAKE_SECRET",
  "source": "ios-shortcut",
  "channel": "wechat",
  "entry": "wechat-clipboard"
}
```

## 每次运行逻辑

1. 读取配置文件。
2. 获取剪贴板。
3. POST 到 CloudBase URL。
4. 显示成功或失败通知。

请求体：

```json
{
  "secret": "YOUR_INTAKE_SECRET",
  "text": "剪贴板内容",
  "source": "ios-shortcut",
  "channel": "wechat",
  "entry": "wechat-clipboard"
}
```

## 重置配置

删除这个文件后再次运行快捷指令：

```text
iCloud Drive/Shortcuts/lark-reading-calendar-config.json
```

快捷指令会重新进入首次配置流程。
