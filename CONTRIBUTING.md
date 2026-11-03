# Contributing

English | [中文](CONTRIBUTING.zh.md)

<a id="summary"></a>

## Summary

Contribute bug reports, documentation, tests, and code for the community-maintained [go-vita/deepseek_harness_optimized](https://github.com/go-vita/deepseek_harness_optimized) variant here. Use this repository’s issues and pull requests, with code changes targeting `main`. DeepSeek AI develops the upstream DeepSeek Harness project; its contribution policy applies separately to upstream submissions.

<a id="report-an-issue"></a>

## Report an issue

Search [existing issues](https://github.com/go-vita/deepseek_harness_optimized/issues) before opening a report. Describe the expected behavior, observed behavior, and smallest reproducible example.

- Include the build version or source revision, operating system, and installation method.
- For provider or relay problems, include the provider protocol, client and relay versions, relevant configuration with secrets removed, and the error message.
- For build or installation failures, include the command, runtime and package-manager versions, and relevant sanitized output.

Remove API keys, credentials, private URLs, and conversation content from reports and attachments. Use a synthetic reproduction when private data is involved.

<a id="propose-a-change"></a>

## Propose a change

Open a [pull request](https://github.com/go-vita/deepseek_harness_optimized/pulls) against this repository’s `main` branch. Describe the problem, resulting behavior, scope, and checks actually run. Keep changes focused and update affected documentation and tests together.

Follow [AGENTS.md](AGENTS.md) and the [development guide](docs/development.md) for repository conventions and applicable checks. Select focused checks for the changed behavior; follow the [testing policy](docs/testing.md) for integration, snapshot, and artifact coverage. Report failures, skipped checks, and untested platforms explicitly.

Keyless tests and recorded-session replay let contributors validate changes without paid API credentials. Real-API end-to-end tests require the relevant configured secret and may incur provider charges. A suite that skips because credentials are absent does not verify live-provider behavior; distinguish skipped tests from passing tests in the pull request.

Never commit secrets, local databases, private prompts, or unsanitized session logs. Use synthetic fixtures and review generated files and the staged diff before committing.

<a id="upstream-project"></a>

## Upstream project

This community variant builds on [DeepSeek AI’s DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Consult the [official upstream contribution policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) before submitting to that project; this guide does not define upstream pull-request acceptance.

<a id="dev-note"></a>

## Dev note

None.
