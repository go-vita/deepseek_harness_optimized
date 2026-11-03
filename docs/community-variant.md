---
description: Community variant scope, relay requirements, and distribution choices.
---

<a id="community-variant"></a>

# Community variant

English | [中文](community-variant.zh.md)

<a id="summary"></a>

## Summary

This community variant adds relay session reuse and acknowledged HTTP deltas to DeepSeek Harness. Compatible Codex and Claude relays can continue native CLI state while Harness keeps its own conversation history. Direct model APIs retain their ordinary request behavior. This reference distinguishes those mechanisms and identifies the client, server, and release requirements.

<a id="contents"></a>

## Table of Contents

- [Background and scope](#background-and-scope)
- [Connection behavior](#connection-behavior)
- [Codex protocol choice](#codex-protocol-choice)
- [Chat Completions compatibility](#chat-completions-compatibility)
- [Other community changes](#other-community-changes)
- [Sessions, transport, and cost](#sessions-transport-and-cost)
- [Requirements and recovery](#requirements-and-recovery)
- [Distribution](#distribution)

-----

<a id="background-and-scope"></a>

## Background and scope

The community variant builds on [DeepSeek Harness](../README.md), developed by [DeepSeek AI](https://deepseek.com). Community changes and release assets are maintained independently; they do not imply official endorsement by DeepSeek, OpenAI, or Anthropic.

This page describes the community variant's connection choices and distribution boundaries. The [pi-ai adapter reference](../packages/llm/llm-pi-ai/README.md) owns protocol and configuration details.

<a id="connection-behavior"></a>

## Connection behavior

Harness sends HTTP requests to the gateway, which drives a native Codex CLI or Claude CLI backend. The CLIs, their account authentication, and persisted native session state live on the relay host; a remote Harness client does not need either CLI installed locally. This repository distributes the Harness client changes, not the separate relay service. Configure the relay's base URL and API key in Harness. Relay features require a matching backend and client. An ordinary API endpoint does not become a session-aware relay merely because it accepts the same API format.

| Connection | Current source behavior | Requirement |
|---|---|---|
| Codex relay through OpenAI Responses (recommended) | Reuses native CLI state and sends acknowledged HTTP deltas through the direct item path. | Matching session-aware relay backend and client. |
| Codex relay through OpenAI Chat Completions (compatibility) | Reuses native CLI state and sends acknowledged HTTP deltas through a message-to-item projection. | Matching session-aware relay backend and client; supported Chat history. |
| Claude relay through Anthropic Messages | Reuses native CLI state and sends acknowledged HTTP deltas. | Matching backend and client with Anthropic relay support. |
| Direct Z.ai or DeepSeek API | Sends the full current context; upstream caching follows the provider's rules. | Ordinary API credentials and provider configuration. |
| Other ordinary providers | Retains existing provider behavior. | Normal provider requirements. |

<a id="codex-protocol-choice"></a>

## Codex protocol choice

Prefer Responses for this project's Codex CLI relay. The relay's canonical history uses Responses-style message, function-call, and function-result items, so Responses takes the direct path. Chat Completions projects `messages`, `tool_calls`, and tool results into those items. Responses also exposes explicit `response.completed` and `response.failed` stream events; Chat uses a finishing chunk followed by `[DONE]`. This recommendation concerns this gateway's implementation, not Chat Completions deprecation.

Both current Codex routes support session reuse, acknowledged deltas, gzip, reasoning controls, and service tiers where the model and endpoint accept them. Responses uses `reasoning.effort`; Chat uses `reasoning_effort`. Both use `service_tier`. Choosing Responses does not itself fix oversized requests, stream errors, or unknown native state, and it does not guarantee lower cost. The same policy of stopping on uncertain native state applies.

<a id="chat-completions-compatibility"></a>

## Chat Completions compatibility

Chat Completions remains supported within this relay's conversion rules. The main compatibility requirements are:

- Session history must use modern `tool_calls` and matching `tool_call_id` results. Legacy `function_call` history is rejected. Multiple function calls in one assistant message are supported; the client tracks their expanded canonical item count separately from the message count.
- The Chat relay supports text, inline images in user messages, and client-defined function tools. It does not pass arbitrary multimodal content or built-in tools through to the CLI. Choosing Responses does not imply unrestricted support for those inputs either.
- A streaming Chat checkpoint advances only after a valid `relay_ack` on a finishing chunk with `finish_reason` equal to `stop` or `tool_calls`, followed by `[DONE]`. An interrupted stream or missing `[DONE]` cannot advance it.
- Streaming usage is emitted in a separate chunk only when the client requests `stream_options.include_usage`. A client that omits that option or ignores the usage chunk can lack displayed token statistics; the relay still accounts for the completed generation. Responses includes usage with its completed response.
- Older unmodified Chat clients without `relay_context` use stateless requests and send full HTTP history. Session reuse and deltas need the updated client and matching backend; Responses has the same extension prerequisite.

The [adapter reference](../packages/llm/llm-pi-ai/README.md) owns transport configuration. The [recovery requirements](#requirements-and-recovery) apply to either protocol when continuation state is uncertain.

<a id="other-community-changes"></a>

## Other community changes

The community variant also includes the following changes. Package references own the detailed behavior; release notes identify which builds contain them.

- Per-model reasoning choices and API mappings are configurable in [model settings](../packages/client/ui-settings-models/README.md).
- Compatible OpenAI routes offer session-scoped Fast mode and a lightning indicator; availability follows the model and endpoint. See [model selection](../packages/client/ui-model-selection/README.md).
- The weekly quota footer is shown only for keys the relay permits to query account quota. See the [adapter reference](../packages/llm/llm-pi-ai/README.md).
- Context overflow uses bounded compaction and recovery attempts; an indivisible oversized input can still need manual reduction. See [compaction](../packages/compaction/compaction-basic/README.md).
- Linux VirtualBox shared folders use a file-creation fallback when hard links are unsupported. See [local filesystem behavior](../packages/fs/fs-local/README.md).

<a id="sessions-transport-and-cost"></a>

## Sessions, transport, and cost

A logical Harness session stores the conversation and tool history. The relay saves and restores native Codex or Claude session state and reuses it only when continuation can be validated. Reuse does not require the same CLI process to remain running. Neither state replaces the other.

An HTTP suffix contains only history after an acknowledged checkpoint. It reduces repeated client-to-relay transfer; gzip further reduces transmitted bytes. Upstream caching concerns model-side processing and accounting, independently of those transport choices.

Session reuse and smaller HTTP requests do not guarantee a cache hit, a fixed saving, or free historical tokens. Inspect actual provider usage and billing; a smaller request body alone does not establish a lower model cost.

<a id="requirements-and-recovery"></a>

## Requirements and recovery

Update both the relay server and Harness client before relying on these features. Capability autodetection enables the required transport without saving the provider configuration again. Manual `relaySessionReuse`, `relayDeltaRequests`, and `gzipRequests` flags remain supported for compatible relays; the model settings transport status is read-only, not a set of manual toggles.

A negative capability discovery result is cached in the client process. After upgrading a previously unsupported relay, fully quit and reopen the desktop app, or restart the Web Host. Refreshing the browser alone does not restart that process.

When native continuation state or a previous request's outcome is unknown, stop and resolve the reported state before continuing. Do not silently reconstruct full history into a fresh native session or change the request identity to force a retry.

-----

<a id="distribution"></a>

## Distribution

Download community builds from this fork's [Releases](https://github.com/go-vita/deepseek_harness_optimized/releases). Choose the Windows EXE installer for desktop use, or the prebuilt Web archive for macOS or Linux. The [Web package instructions](../scripts/web-portable/README.md) own installation and update steps.

The Web archive includes prebuilt application assets, but no runtime or installed third-party dependencies. Install those prerequisites as documented; no source rebuild is required after dependency installation. macOS installation still requires validation on a real Mac.

Source support does not establish what an older release asset contains or what a relay operator has deployed. Check the asset's recorded source commit and release notes, then verify the matching backend.
