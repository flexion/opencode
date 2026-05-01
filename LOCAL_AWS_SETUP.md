# Local Build & AWS Bedrock Setup

Instructions for building and running the Flexion fork of opencode.

## AWS Credentials Setup

AWS credentials and opencode configuration are managed by **flexcamp-ai**:

```
https://github.com/flexion/flexcamp-ai
```

Follow the setup instructions there before building or running this fork. flexcamp-ai handles AWS authentication, the `opencode-work` shell function, and `~/.config/opencode/opencode.json`.

---

## Prerequisites (build only)

- [Bun](https://bun.sh) v1.3+
- Git + SSH key configured for GitHub (with access to the `flexion` org)

## Clone & Build

```bash
git clone git@github.com:flexion/opencode.git
cd opencode

# Switch to the Flexion customizations branch
git checkout flex

# Install dependencies
# Note: if your global ~/.npmrc redirects to a private registry (e.g. CMS Artifactory),
# override it so public packages resolve correctly:
BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun install

# Build for your current platform only
BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun run --cwd packages/opencode build --single --skip-embed-web-ui
```

The binary will be at:
- macOS ARM64: `packages/opencode/dist/opencode-darwin-arm64/bin/opencode`
- macOS x64:   `packages/opencode/dist/opencode-darwin-x64/bin/opencode`
- Linux ARM64:  `packages/opencode/dist/opencode-linux-arm64/bin/opencode`
- Linux x64:    `packages/opencode/dist/opencode-linux-x64/bin/opencode`

Verify the build:

```bash
./packages/opencode/dist/opencode-darwin-arm64/bin/opencode --version
```

> **Note on model config:** Config keys in `opencode.json` must match the snapshot model ID exactly (e.g. `writer.palmyra-x5-v1:0`) — the `us.` cross-region inference profile prefix is added automatically at runtime for supported models and regions.
>
> **`tool_call: false`:** Models marked with `tool_call: false` do not support tool use in streaming mode on Bedrock. This prevents opencode from sending tool definitions to those models.
>
> **`reasoning: false`:** Models marked with `reasoning: false` will have reasoning content stripped from message history before being sent to the model. Required for models like DeepSeek R1 on Bedrock that generate reasoning output but reject it as input in subsequent turns.

## Keeping the Fork Up to Date

When upstream releases a new version, sync `dev` and rebase `flex`:

```bash
git fetch upstream  # upstream = https://github.com/anomalyco/opencode.git
git checkout dev
git reset --hard upstream/dev
git push origin dev --force

git checkout flex
git rebase dev
# Resolve any conflicts, then:
git push origin flex --force
```

See [flexion/opencode#2](https://github.com/flexion/opencode/pull/2) for the full list of Flexion customizations and conflict resolution notes.

## What's Different in This Fork (`flex` branch)

| Change | File(s) | Description |
|--------|---------|-------------|
| Hide skill prompt text from chat UI | `packages/opencode/src/session/prompt.ts` | Marks skill template as `synthetic` so the full prompt is sent to the model but hidden from the user |
| Respect `tool_call: false` at runtime | `packages/opencode/src/session/llm.ts` | Gates tool resolution behind `capabilities.toolcall` — fixes failures on Bedrock models that don't support streaming + tool use |
| Re-sign macOS binaries after build | `packages/opencode/script/build.ts` | Strips Bun's embedded signature and applies a fresh ad-hoc one — fixes SIGKILL (exit 137) on Darwin 25+ where Bun's signature format is rejected |
| Add inference profile prefixes for palmyra and pixtral | `packages/opencode/src/provider/provider.ts` | Adds `us.` cross-region inference profile prefix for Writer Palmyra and Mistral Pixtral models in US regions |
| Strip reasoning from history for non-reasoning models | `packages/opencode/src/provider/transform.ts` | Removes reasoning content parts from assistant message history before sending to models with `reasoning: false` — fixes Bedrock rejections when switching from a reasoning model |
| Exclude palmyra from reasoning variant generation | `packages/opencode/src/provider/transform.ts` | Prevents unsupported `reasoningConfig` parameters from being sent to Writer Palmyra models |
| Local build & AWS Bedrock setup docs | `LOCAL_AWS_SETUP.md` | This file |

Full details and upstream tracking: [flexion/opencode#2](https://github.com/flexion/opencode/pull/2)

Upstream issue: [anomalyco/opencode#19966](https://github.com/anomalyco/opencode/issues/19966)
