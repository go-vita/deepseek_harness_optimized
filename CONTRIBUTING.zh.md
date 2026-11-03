# 贡献

[English](CONTRIBUTING.md) | 中文

<a id="summary"></a>

## 概述

请在这里为社区维护的 [go-vita/deepseek_harness_optimized](https://github.com/go-vita/deepseek_harness_optimized) 变体提交问题报告、文档、测试和代码。使用本仓库的 issue 和 pull request，代码修改以 `main` 为目标分支。上游 DeepSeek Harness 由 DeepSeek AI 开发，向上游提交贡献时须另行遵循其贡献政策。

<a id="report-an-issue"></a>

## 报告问题

提交报告前，请先搜索[现有 issue](https://github.com/go-vita/deepseek_harness_optimized/issues)。说明预期行为、实际行为，并提供最小复现示例。

- 附上构建版本或源码版本、操作系统及安装方式。
- 提供商或中转问题请附上提供商协议、客户端与中转版本、移除秘密信息后的相关配置，以及错误消息。
- 构建或安装失败请附上执行的命令、运行时与包管理器版本，以及经过脱敏的相关输出。

请从报告和附件中移除 API 密钥、凭据、私密 URL 和对话内容。涉及私人数据时，请使用合成数据复现。

<a id="propose-a-change"></a>

## 提交修改

向本仓库的 `main` 分支提交 [pull request](https://github.com/go-vita/deepseek_harness_optimized/pulls)。说明问题、修改后的行为、范围及实际运行的检查。保持修改聚焦，并同步更新受影响的文档和测试。

仓库约定和适用检查见 [AGENTS.md](AGENTS.md) 与[开发指南](docs/development.zh.md)。针对修改的行为选择相关检查；集成、快照和产物覆盖要求见[测试政策](docs/testing.zh.md)。请明确说明失败、跳过的检查以及未经测试的平台。

不需要密钥的测试和已录制会话回放可用于在没有付费 API 凭据时验证修改。真实 API 端到端测试需要配置相应秘密信息，并可能产生提供商费用。因缺少凭据而跳过的测试不能验证真实提供商行为；请在 pull request 中区分跳过和通过的测试。

不要提交秘密信息、本地数据库、私人提示词或未经脱敏的会话日志。使用合成测试数据，并在提交前检查生成文件和暂存区差异。

<a id="upstream-project"></a>

## 上游项目

本社区优化版基于 [DeepSeek AI 的 DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。向该项目提交贡献前，请查阅[上游官方贡献政策](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md)；本指南不规定上游是否接受 pull request。

<a id="dev-note"></a>

## 开发备注

无。
