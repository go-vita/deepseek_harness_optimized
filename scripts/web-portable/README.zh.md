<a id="harness-prebuilt-web-package"></a>

# Harness 预构建 Web 包

[English](README.md) | 中文

此包包含适用于 macOS 和 Linux（x64 或 ARM64）的预构建 Harness JavaScript 和 Web 资源，不包含 Node.js、Electron 应用、平台可执行文件或已安装的第三方依赖。Windows 用户应使用 Windows 桌面安装包。

<a id="install"></a>

## 安装

1. 自行安装 Node.js 24.9 或更高版本，以及 pnpm 11.28.5。
2. 将压缩包解压到可写目录，保留完整的 `packages` 目录和锁文件。
3. 在终端中运行 `./install.sh`。此步骤明确下载并安装依赖，需要网络。原生依赖可能需要 C/C++ 工具链和 Python，无需构建前端或后端源码。
4. 运行 `./start.sh`。Harness 会打印带鉴权信息的本地 URL，通常也会打开浏览器。保持终端运行，按 Ctrl+C 停止。

可使用 `./start.sh --port 8080 --no-open` 指定端口并禁止自动打开浏览器。正常 Web 配置默认仅供本机访问，请勿公开分享带鉴权信息的启动 URL。

启动脚本只检查运行要求，不会安装依赖或下载运行时。启动后在 Harness 中配置供应商 API Key 和模型。需要其他外部应用的功能，仍依赖用户自行安装相应工具。

<a id="data-and-updates"></a>

## 数据与升级

会话和供应商设置使用安装包之外的正常 Harness 主目录（`~/.dsh`，或已有的 `DSH_HOME`）。已有 Web 配置数据会被复用；桌面配置独立，不会自动迁移。升级时解压新包，运行其安装脚本，再启动。不要在版本之间或操作系统之间复制旧的 `node_modules` 目录。此包没有自动升级器。

<a id="macos-distribution"></a>

## macOS 分发

压缩包提供预构建业务代码和包清单，而非自建的原生 Mac 应用。运行时和原生依赖由用户自行安装，可减少对发布者 Developer ID 的依赖，但不能保证 macOS 不会对用户选择的运行时或依赖显示安全提示。脚本不会修改 Gatekeeper、隔离属性或系统安全设置。Mac 安装仍需在真实机器上下载压缩包后验证。

`build.json` 记录源码提交和构建版本。安装或启动前会按照 `packages.sha256.json` 检查包文件。依赖锁定在 `pnpm-lock.yaml` 中，本地覆盖确保不会用仓库上游版本替换此分支代码。
