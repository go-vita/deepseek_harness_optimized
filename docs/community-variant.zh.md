---
description: 社区优化版的范围、中转要求与分发方式。
---

<a id="community-variant"></a>

# 社区优化版

[English](community-variant.md) | 中文

<a id="summary"></a>

## 概要

本社区优化版为 DeepSeek Harness 增加了中转会话复用与带确认的 HTTP 增量请求。兼容的 Codex 和 Claude 中转可以延续原生 CLI（命令行界面）状态，同时由 Harness 保留自身的对话历史。直连模型 API 继续使用原有请求方式。本参考区分这些机制，并说明客户端、服务端与发布版本的要求。

<a id="contents"></a>

## 目录

- [背景与范围](#background-and-scope)
- [连接行为](#connection-behavior)
- [Codex 协议选择](#codex-protocol-choice)
- [Chat Completions 兼容性](#chat-completions-compatibility)
- [其他社区改进](#other-community-changes)
- [会话、传输与费用](#sessions-transport-and-cost)
- [前提与恢复](#requirements-and-recovery)
- [分发方式](#distribution)

-----

<a id="background-and-scope"></a>

## 背景与范围

本社区优化版基于 [DeepSeek Harness](../README.zh.md)，该项目由 [DeepSeek AI](https://deepseek.com) 开发。社区改动与发布产物独立维护，不代表 DeepSeek、OpenAI 或 Anthropic 的官方认可。

本页说明社区优化版的连接方式与分发边界。协议和配置细节由 [pi-ai 适配器参考](../packages/llm/llm-pi-ai/README.zh.md) 维护。

<a id="connection-behavior"></a>

## 连接行为

Harness 通过 HTTP 向网关发出请求，再由网关驱动原生 Codex CLI 或 Claude CLI 后端。CLI、其账号鉴权信息及持久化原生会话状态均位于中转主机；远程 Harness 客户端无需在本机安装这两个 CLI。本仓库分发 Harness 客户端改动，不包含独立部署的中转服务。请在 Harness 中配置中转的基础地址与 API Key。中转功能需要匹配的服务端与客户端。普通 API 端点即使接受相同的 API 格式，也不会因此具备中转会话能力。

| 连接方式 | 当前源码行为 | 要求 |
|---|---|---|
| 通过 OpenAI Responses 的 Codex 中转（推荐） | 复用原生 CLI 状态，通过直接的条目路径发送带确认的 HTTP 增量请求。 | 匹配的会话感知中转服务端与客户端。 |
| 通过 OpenAI Chat Completions 的 Codex 中转（兼容） | 复用原生 CLI 状态，通过消息到条目的投影发送带确认的 HTTP 增量请求。 | 匹配的会话感知中转服务端与客户端；受支持的 Chat 历史。 |
| 通过 Anthropic Messages 的 Claude 中转 | 复用原生 CLI 状态，并发送带确认的 HTTP 增量请求。 | 支持 Anthropic 中转的匹配服务端与客户端。 |
| 直连 Z.ai 或 DeepSeek API | 发送完整的当前上下文；上游缓存遵循模型提供商规则。 | 普通 API 凭据与模型提供商配置。 |
| 其他普通模型提供商 | 保持原有提供商行为。 | 模型提供商的常规要求。 |

<a id="codex-protocol-choice"></a>

## Codex 协议选择

本项目的 Codex CLI 中转推荐使用 Responses。中转的规范化历史采用 Responses 风格的消息、函数调用与函数结果条目，因此 Responses 走直接路径。Chat Completions 则将 `messages`、`tool_calls` 和工具结果投影为这些条目。Responses 还提供明确的 `response.completed` 和 `response.failed` 流事件；Chat 使用结束块加 `[DONE]`。这项建议针对本网关的实现，并不表示 Chat Completions 已弃用。

当前两种 Codex 路由都支持会话复用、带确认的增量请求、gzip、推理控制，以及模型和端点允许的服务档位。Responses 使用 `reasoning.effort`，Chat 使用 `reasoning_effort`，两者都使用 `service_tier`。选择 Responses 本身不会解决请求过大、流错误或原生状态不明的问题，也不保证降低费用。原生状态不明时仍须停止。

<a id="chat-completions-compatibility"></a>

## Chat Completions 兼容性

Chat Completions 在本中转的转换规则范围内继续受支持。主要兼容要求如下：

- 会话历史须使用现代 `tool_calls` 与具有匹配 `tool_call_id` 的结果；旧式 `function_call` 历史会被拒绝。一条助手消息中的多个函数调用受支持；客户端分别跟踪展开后的规范化条目数量与消息数量。
- Chat 中转支持文本、用户消息中的内联图片，以及客户端定义的函数工具，不会将任意多模态内容或内置工具透传给 CLI。选择 Responses 也不意味着这些输入不受限制。
- 流式 Chat 检查点只有在 `finish_reason` 为 `stop` 或 `tool_calls` 的结束块中收到有效 `relay_ack`，随后收到 `[DONE]` 时才会推进。流被中断或缺少 `[DONE]` 时不能推进。
- 流式用量只有在客户端请求 `stream_options.include_usage` 时才会通过独立块返回。未请求该选项或忽略用量块的客户端可能不显示 token 统计，但中转仍会对已完成的生成记账。Responses 将用量包含在已完成的响应中。
- 未修改的旧 Chat 客户端如果没有 `relay_context`，会使用无状态请求并发送完整 HTTP 历史。会话复用与增量请求需要更新后的客户端和匹配的服务端；Responses 也有相同的扩展前提。

传输配置由[适配器参考](../packages/llm/llm-pi-ai/README.zh.md)维护。无论选择哪种协议，续接状态不明时都须遵循[恢复要求](#requirements-and-recovery)。

<a id="other-community-changes"></a>

## 其他社区改进

社区优化版还包含以下改进。详细行为由各包参考文档维护；哪些构建包含这些改进，以发布说明为准。

- 可在[模型设置](../packages/client/ui-settings-models/README.zh.md)中配置每个模型的推理选项与 API 映射。
- 兼容的 OpenAI 路由提供会话级 Fast 模式和闪电标识；可用性取决于模型与端点。参见[模型选择](../packages/client/ui-model-selection/README.zh.md)。
- 周额度页脚仅对中转允许查询账号额度的 Key 显示。参见[适配器参考](../packages/llm/llm-pi-ai/README.zh.md)。
- 上下文溢出采用次数有界的压缩与恢复尝试；不可拆分的超大输入仍可能需要手动缩减。参见[上下文压缩（context compaction）](../packages/compaction/compaction-basic/README.zh.md)。
- Linux VirtualBox 共享文件夹在不支持硬链接时使用文件创建替代路径。参见[本地文件系统行为](../packages/fs/fs-local/README.zh.md)。

<a id="sessions-transport-and-cost"></a>

## 会话、传输与费用

Harness 逻辑会话保存对话与工具历史。中转保存和恢复原生 Codex 或 Claude 会话状态，只有能够验证续接时才会复用。复用不要求同一个 CLI 进程持续运行。两种状态不能互相替代。

HTTP 后缀仅包含已确认检查点之后的历史，可减少客户端到中转的重复传输；gzip 进一步减少传输字节。上游缓存涉及模型侧处理和计量，与这些传输方式相互独立。

会话复用和更小的 HTTP 请求不保证缓存命中、固定节省比例或历史 token 免费。请查看模型提供商的实际用量与账单；请求体变小本身不能证明模型费用降低。

<a id="requirements-and-recovery"></a>

## 前提与恢复

依赖这些功能前，须同时更新中转服务端与 Harness 客户端。能力自动发现会启用所需传输方式，无需重新保存模型提供商配置。兼容中转仍支持手动设置 `relaySessionReuse`、`relayDeltaRequests` 和 `gzipRequests`；模型设置中的传输状态只读，并非手动开关。

能力发现的否定结果会缓存在客户端进程中。升级此前不支持该能力的中转后，请完全退出并重新打开桌面应用，或重启 Web Host。仅刷新浏览器不会重启该进程。

原生续接状态或上一次请求结果不明时，应停止并处理报告的状态后再继续。不要静默地将完整历史重建为新的原生会话，也不要更换请求身份来强制重试。

-----

<a id="distribution"></a>

## 分发方式

请从本 fork 的 [Releases](https://github.com/go-vita/deepseek_harness_optimized/releases) 下载社区构建。Windows 桌面使用 EXE 安装器，macOS 或 Linux 使用预构建 Web 压缩包。安装和更新步骤由 [Web 包说明](../scripts/web-portable/README.zh.md) 维护。

Web 压缩包包含预构建应用资源，不包含运行时或已安装的第三方依赖。按文档安装这些前提组件后，无需从源码重新构建。macOS 安装仍需在真实 Mac 上验证。

源码支持不代表旧发布产物包含该功能，也不代表中转运营者已部署。请核对产物记录的源码提交与发布说明，再验证匹配的服务端。
