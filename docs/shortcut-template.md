# 快捷指令模板

iCloud 模板链接：

```text
https://www.icloud.com/shortcuts/e53f733c6bfd4f02b4b363749706150f
```

这是首版最简模板。用户导入后需要手动替换两个占位符：

| 位置 | 占位符 | 替换为 |
| --- | --- | --- |
| URL | `https://YOUR_CLOUDBASE_HTTP_URL` | 用户自己的 CloudBase HTTP 访问地址 |
| JSON 字段 `secret` | `YOUR_INTAKE_SECRET` | 用户自己的 `INTAKE_SECRET` |

## 每次运行逻辑

1. 获取剪贴板。
2. 从剪贴板获取文本。
3. 请求确认是否提交。
4. POST 到 CloudBase URL。

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

## 后续增强

后续可以升级为首次运行配置方案：首次询问 CloudBase HTTP URL 和 `INTAKE_SECRET`，保存到 `iCloud Drive/Shortcuts/lark-reading-calendar-config.json`，后续运行自动读取配置。
