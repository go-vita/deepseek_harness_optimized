---
kind: upgrade-guide
description: OpenAI custom-model reasoning settings use wire parameter names instead of internal level aliases.
---

# OpenAI reasoning levels

English | [中文](guide.zh.md)

## Change

The custom-model editor for OpenAI Responses and Chat Completions uses `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. API values match their level names. New reasoning declarations start with `low` through `ultra`; optional `none` and `minimal` remain model-dependent. Other protocols retain their existing vocabulary.

The adapter accepts native `ultra` and `none` declarations and preserves them in final requests despite older pi-ai versions lacking these levels.

## Migration

1. Open the OpenAI provider in Settings → Models. Existing aliases are shown by their API values: for example, `minimal: ultra` becomes `ultra: ultra`, and `off: null` becomes `none: none`.
2. Save a reasoning configuration edit to write matching names into the profile `cordis.patch.yml`. Select only levels supported by the endpoint.
3. In existing conversations, reselect the reasoning level if the selected alias was renamed. Confirm that the menu offers `ultra` and that selecting it sends `reasoning.effort: ultra` for Responses or `reasoning_effort: ultra` for Chat Completions.
