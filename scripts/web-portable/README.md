<a id="harness-prebuilt-web-package"></a>

# Harness prebuilt Web package

English | [中文](README.zh.md)

This package contains prebuilt Harness JavaScript and Web assets for macOS and Linux (x64 or ARM64). It does not contain Node.js, an Electron app, a platform executable, or installed third-party dependencies. Windows users should use the Windows desktop installer.

<a id="install"></a>

## Install

1. Install Node.js 24.9 or later and pnpm 11.28.5 yourself.
2. Extract this archive into a writable directory. Keep its `packages` directory and lockfile together.
3. Run `./install.sh` in Terminal. This explicitly downloads and installs dependencies; network access is required. Native dependencies may need a C/C++ toolchain and Python. No frontend or backend source build is required.
4. Run `./start.sh`. Harness prints an authenticated local URL and normally opens the browser. Keep the terminal running; press Ctrl+C to stop.

To choose a port or avoid opening a browser, run `./start.sh --port 8080 --no-open`. The normal Web profile uses local access by default. Do not share the authenticated startup URL publicly.

The startup script checks requirements and never installs dependencies or downloads a runtime. Provider API keys and model settings are configured in Harness after startup. Features requiring additional external applications remain dependent on tools you install yourself.

<a id="data-and-updates"></a>

## Data and updates

Sessions and provider settings use the normal Harness home (`~/.dsh`, or your existing `DSH_HOME`) outside this package. Existing Web-profile data is reused. A desktop profile is separate and is not automatically migrated. To update, extract a new bundle, run its install script, and start it; do not copy the old `node_modules` directory between releases or operating systems. There is no automatic updater.

<a id="macos-distribution"></a>

## macOS distribution

The archive contains prebuilt business code and package manifests rather than a custom native Mac application. You install the runtime and native dependencies yourself. This reduces reliance on a publisher Developer ID, but it does not guarantee that macOS will never display security prompts for your chosen runtime or dependencies. No Gatekeeper, quarantine, or system security settings are changed by these scripts. Mac installation still requires validation on a real machine after downloading the archive.

`build.json` records the source commit and build version. Package tarballs are checked against `packages.sha256.json` before installation or startup. Dependencies are locked in `pnpm-lock.yaml`; local overrides keep this fork’s code from being replaced by registry versions.
