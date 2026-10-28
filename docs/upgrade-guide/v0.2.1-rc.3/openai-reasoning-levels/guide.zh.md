---
kind: upgrade-guide
description: OpenAI 自定义模型的推理配置改用实际参数名称，替代内部档位别名。
---

# OpenAI 推理等级

[English](guide.md) | 中文

## 变更

OpenAI Responses 和 Chat Completions 的自定义模型编辑器使用 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra`，API 参数值与档位名相同。新配置默认添加 `low` 到 `ultra` 六档；可选的 `none` 和 `minimal` 取决于模型能力。其他协议保留原有词汇。

适配器原生接受 `ultra` 和 `none`，即使旧版 pi-ai 没有这些档位，最终请求也会保留原值。

## 迁移

1. 在设置 → 模型中打开 OpenAI 供应商。旧映射按 API 参数值显示，例如 `minimal: ultra` 显示为 `ultra: ultra`，`off: null` 显示为 `none: none`。
2. 保存一次推理配置修改，将同名键值写入配置目录的 `cordis.patch.yml`。只选择端点支持的档位。
3. 旧会话如果选用了已重命名的别名，请重新选择推理等级。确认菜单中有 `ultra`，选择后 Responses 请求发送 `reasoning.effort: ultra`，Chat Completions 请求发送 `reasoning_effort: ultra`。
