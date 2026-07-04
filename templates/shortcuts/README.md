# 快捷指令模板

iCloud 模板链接：

```text
https://www.icloud.com/shortcuts/e53f733c6bfd4f02b4b363749706150f
```

模板名：

```text
Lark Reading Calendar Setup
```

## 使用方式

这是首版最简模板。导入后请先打开快捷指令编辑页，展开最后一个「获取 URL 内容」动作，替换两个占位符。

| 位置 | 占位符 | 替换为 |
| --- | --- | --- |
| URL | `https://YOUR_CLOUDBASE_HTTP_URL` | 你的 CloudBase HTTP 访问地址 |
| JSON 字段 `secret` | `YOUR_INTAKE_SECRET` | 你的 `INTAKE_SECRET` |

其他字段保持默认：

| JSON 字段 | 默认值 |
| --- | --- |
| `source` | `ios-shortcut` |
| `channel` | `wechat` |
| `entry` | `wechat-clipboard` |

配置完成后，复制一段微信内容，运行快捷指令即可提交到 CloudBase。

## 动作结构

```text
获取剪贴板
从剪贴板获取文本
请求输入：请确认是否存入以下内容？
获取 URL 内容：POST JSON 到 CloudBase
```

请求 JSON：

```json
{
  "secret": "YOUR_INTAKE_SECRET",
  "source": "ios-shortcut",
  "text": "<剪贴板文本>",
  "channel": "wechat",
  "entry": "wechat-clipboard"
}
```

## 后续计划

后续可以升级为“首次运行保存配置到 iCloud Drive”的版本，避免每个用户手动编辑快捷指令。

## 发布前检查清单

- 模板中只包含 `https://YOUR_CLOUDBASE_HTTP_URL`，不包含真实 CloudBase URL。
- 模板中只包含 `YOUR_INTAKE_SECRET`，不包含真实 `INTAKE_SECRET`。
- 请求体字段与 CloudBase 云函数文档一致。
