# 快捷指令模板

目标模板名：

```text
Lark Reading Calendar Setup
```

目标导出文件：

```text
LarkReadingCalendar-Setup.shortcut
```

> 注意：`.shortcut` 文件必须由 Apple Shortcuts App 生成并导出。不要手写一个同名文件伪装成可导入模板。正式发布前请在 iPhone 上导入验证一次，并确认文件中没有真实 CloudBase URL 或 secret。

## 用户体验

首次运行：

1. 询问 CloudBase HTTP URL。
2. 询问 `INTAKE_SECRET`。
3. 使用默认值：
   - `source`: `ios-shortcut`
   - `channel`: `wechat`
   - `entry`: `wechat-clipboard`
4. 保存配置到 iCloud Drive。

后续运行：

1. 读取配置。
2. 获取剪贴板。
3. POST 到 CloudBase。
4. 显示成功或失败通知。

## 配置文件

保存位置：

```text
iCloud Drive/Shortcuts/lark-reading-calendar-config.json
```

内容：

```json
{
  "cloudbaseUrl": "https://YOUR_CLOUDBASE_HTTP_URL",
  "secret": "YOUR_INTAKE_SECRET",
  "source": "ios-shortcut",
  "channel": "wechat",
  "entry": "wechat-clipboard"
}
```

## 手动搭建动作蓝图

### A. 首次配置

1. 获取文件：
   - 路径：`Shortcuts/lark-reading-calendar-config.json`
   - 如果不存在，不报错。
2. 如果文件没有值：
   - 请求输入：CloudBase HTTP URL
   - 请求输入：INTAKE_SECRET
   - 词典：
     - `cloudbaseUrl`: 第一次请求输入
     - `secret`: 第二次请求输入
     - `source`: `ios-shortcut`
     - `channel`: `wechat`
     - `entry`: `wechat-clipboard`
   - 获取词典的文本/JSON 表示。
   - 存储文件：
     - 路径：`Shortcuts/lark-reading-calendar-config.json`
     - 覆盖：是

### B. 正常提交

1. 获取文件：`Shortcuts/lark-reading-calendar-config.json`
2. 从输入获取词典。
3. 获取剪贴板。
4. 获取 URL 内容：
   - URL：配置里的 `cloudbaseUrl`
   - 方法：`POST`
   - 请求体：`JSON`
   - JSON 字段：
     - `secret`: 配置里的 `secret`
     - `text`: 剪贴板
     - `source`: 配置里的 `source`
     - `channel`: 配置里的 `channel`
     - `entry`: 配置里的 `entry`
5. 显示通知：`已保存到 Lark Reading Calendar`

## 重置配置

删除：

```text
iCloud Drive/Shortcuts/lark-reading-calendar-config.json
```

再次运行快捷指令即可重新填写 CloudBase URL 和 secret。

## 发布前检查清单

- 导出的 `.shortcut` 内不包含真实 CloudBase URL。
- 导出的 `.shortcut` 内不包含真实 `INTAKE_SECRET`。
- 首次运行能正确生成配置文件。
- 第二次运行能直接读取配置。
- 请求体字段与 CloudBase 云函数文档一致。
