# DeepSeek Harness

[English](README.md) | 中文

<a id="summary"></a>

## 概述

本仓库是由社区维护的 [go-vita/deepseek_harness_optimized](https://github.com/go-vita/deepseek_harness_optimized)，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，其上游由 [DeepSeek AI](https://deepseek.com) 开发。它保留了上游由 [Cordis](https://github.com/cordiverse/cordis) 驱动的一切皆插件架构，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。本社区优化版侧重中转传输、模型控制和社区构建分发，由社区独立维护。

<a id="table-of-contents"></a>

## 目录

- [背景与能力](#background-and-capabilities)
- [开发者预览](#developer-preview)
- [运行](#run)
- [社区与支持](#community-and-support)
- [参与贡献](#contributing)
- [开发](#development)
- [引用](#citation)
- [许可证](#license)
- [开发备注](#dev-note)

<a id="background-and-capabilities"></a>

## 背景与能力

CLI 对话中反复发送的历史记录可能让后续请求体变大。本社区优化版为兼容的 Codex 和 Claude/Anthropic 接入提供中转会话复用、已确认的增量请求和 gzip 传输。这些能力需要适配且已更新的中转后端与客户端。请求压缩和历史复用不保证降低模型 token 用量或费用。

其他改进包括按模型设置推理参数、会话 Fast 模式、在权限允许时显示每周额度，以及压缩恢复。社区构建提供 Windows EXE 安装包和适用于 macOS、Linux 的预构建 Web 包。范围、要求和限制见[社区优化版指南](docs/community-variant.zh.md)。

<a id="developer-preview"></a>

## 开发者预览

DeepSeek Harness 处于开发者预览阶段，迭代较快，可能出现破坏兼容性的变更。运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

可选择社区发布包，也可从本仓库源码构建。上游 npm 包不分发本社区优化版。

<a id="community-packages"></a>

### 社区发布包

从[本仓库的 Releases](https://github.com/go-vita/deepseek_harness_optimized/releases) 下载 Windows EXE 或 macOS/Linux 预构建 Web 压缩包。请按所选版本的安装说明操作；运行环境要求、安装、启动和升级步骤见 [Web 包指南](scripts/web-portable/README.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

安装 Node.js 24.9 或更高版本及 pnpm 11.28.5，然后运行：

```sh
git clone https://github.com/go-vita/deepseek_harness_optimized.git
cd deepseek_harness_optimized
pnpm install --frozen-lockfile
pnpm run build --profile local
pnpm dsh web
```

本地构建会准备应用产物，Web 命令使用这些产物启动 Harness。应用使用方式见 [Web UI 指南](docs/user/guide/index.zh.md)，贡献者环境准备见[开发指南](docs/development.zh.md)。

<a id="community-and-support"></a>

## 社区与支持

本社区优化版的问题请提交至[本仓库的 issue 跟踪器](https://github.com/go-vita/deepseek_harness_optimized/issues)。请附上构建版本、提供商协议和相关错误信息，不要包含 API 密钥或私密对话内容。

上游资源：[官方文档](https://deepseek-harness.github.io/deepseek-harness/)、[GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 和 [Discord 社区](https://discord.gg/4MrtZUhpxg)。上游的 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题可帮助用户发现插件。

<a id="contributing"></a>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。本社区优化版专属的修改请提交至本仓库。

<a id="development"></a>

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。Agent 请遵循 [AGENTS.md](AGENTS.md)。

<a id="citation"></a>

## 引用

上游项目提供以下引用：

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

<a id="license"></a>

## 许可证

[MIT](LICENSE)。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

<a id="dev-note"></a>

## 开发备注

无。
