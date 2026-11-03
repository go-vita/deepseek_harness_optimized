# DeepSeek Harness

English | [中文](README.zh.md)

<a id="summary"></a>

## Summary

This repository is the community-maintained [go-vita/deepseek_harness_optimized](https://github.com/go-vita/deepseek_harness_optimized) variant of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), developed by [DeepSeek AI](https://deepseek.com). It keeps the upstream everything-is-a-plugin architecture powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512). This variant targets Harness → compatible relay → Codex CLI / Claude CLI deployments, with relay transport, model controls, and community builds. It is maintained independently of the upstream project.

<a id="table-of-contents"></a>

## Table of contents

- [Background and capabilities](#background-and-capabilities)
- [Recommended protocols](#recommended-protocols)
- [Developer preview](#developer-preview)
- [Run](#run)
- [Community and support](#community-and-support)
- [Contributing](#contributing)
- [Development](#development)
- [Citation](#citation)
- [License](#license)
- [Dev note](#dev-note)

<a id="background-and-capabilities"></a>

## Background and capabilities

Repeated conversation history from Harness can make requests to a CLI relay large. This variant adds session reuse, acknowledged incremental requests, and gzip transport along the Harness → compatible relay → Codex CLI / Claude CLI path. These features require a suitable updated relay backend and client. Ordinary DeepSeek and Z.ai API behavior remains unchanged. Request compression and history reuse do not guarantee lower model token usage or billing.

Other improvements include per-model reasoning controls, session Fast mode, weekly quota visibility when permitted, and compaction recovery. Community builds provide a Windows EXE installer and a prebuilt Web package for macOS and Linux. See the [community variant guide](docs/community-variant.md) for scope, requirements, and limitations.

<a id="recommended-protocols"></a>

## Recommended protocols

Choose the Harness provider protocol for the CLI served by your compatible relay:

| Relay backend | Harness protocol | Guidance |
|---|---|---|
| Codex CLI | OpenAI Responses (`openai-responses`) | Recommended. |
| Codex CLI | Chat Completions (`openai-completions`) | Compatibility option; updated clients and compatible relays still support session reuse and incremental requests. |
| Claude CLI | Anthropic Messages (`anthropic-messages`) | Recommended. |

Responses matches the shared relay’s canonical input items and event lifecycle, avoiding Chat message and tool normalization. See [Codex protocol choice](docs/community-variant.md#codex-protocol-choice) and [Chat Completions compatibility](docs/community-variant.md#chat-completions-compatibility) for requirements and tradeoffs.

<a id="developer-preview"></a>

## Developer preview

DeepSeek Harness is in developer preview and iterates rapidly. Compatibility-breaking changes can occur. Review the [safety notice](SAFETY.md) before running the project.

<a id="run"></a>

## Run

Choose a community release package or build this repository from source. The upstream npm package does not distribute this variant.

<a id="community-packages"></a>

### Community packages

Download the Windows EXE or macOS/Linux prebuilt Web archive from [this repository’s Releases](https://github.com/go-vita/deepseek_harness_optimized/releases). Follow the selected release’s installation notes and the [Web package guide](scripts/web-portable/README.md) for runtime prerequisites, installation, startup, and upgrades.

<a id="run-from-source"></a>

### Run from source

Install Node.js 24.9 or later and pnpm 11.28.5, then run:

```sh
git clone https://github.com/go-vita/deepseek_harness_optimized.git
cd deepseek_harness_optimized
pnpm install --frozen-lockfile
pnpm run build --profile local
pnpm dsh web
```

The local build prepares the application artifacts. The Web command starts Harness using those artifacts. See the [Web UI guide](docs/user/guide/index.md) for application usage and the [development guide](docs/development.md) for contributor setup.

<a id="community-and-support"></a>

## Community and support

Report issues with this variant in [this repository’s issue tracker](https://github.com/go-vita/deepseek_harness_optimized/issues). Include the build version, provider protocol, and relevant error details without API keys or private conversation content.

Upstream resources: [official documentation](https://deepseek-harness.github.io/deepseek-harness/), [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions), and [Discord community](https://discord.gg/4MrtZUhpxg). The upstream [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic helps users discover plugins.

<a id="contributing"></a>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Submit variant-specific changes to this repository.

<a id="development"></a>

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). Agents follow [AGENTS.md](AGENTS.md).

<a id="citation"></a>

## Citation

The upstream project provides this citation:

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

## License

[MIT](LICENSE). Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<a id="dev-note"></a>

## Dev note

None.
