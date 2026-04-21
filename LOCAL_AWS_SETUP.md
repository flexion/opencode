# Local Build & AWS Bedrock Setup

Instructions for cloning, building, and running the Flexion fork of opencode with AWS Bedrock.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- [AWS CLI](https://aws.amazon.com/cli/) v2
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

## AWS Bedrock Setup

### 1. Configure AWS SSO profile

Add to `~/.aws/config`:

```ini
[profile ClaudeCodeAccess]
sso_start_url = <your-sso-start-url>
sso_region = <your-sso-region>
sso_account_id = <your-account-id>
sso_role_name = AdministratorAccess
region = <your-preferred-region>
```

### 2. Configure opencode for Bedrock

Create `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "amazon-bedrock/us.anthropic.claude-sonnet-4-6",
  "enabled_providers": ["amazon-bedrock"],
  "plugin": [],
  "provider": {
    "amazon-bedrock": {
      "options": {
        "region": "<your-preferred-region>"
      },
      "models": {
        "writer.palmyra-x4-v1:0": {
          "name": "Writer Palmyra X4",
          "tool_call": false,
          "limit": { "context": 128000, "output": 8192 }
        },
        "writer.palmyra-x5-v1:0": {
          "name": "Writer Palmyra X5",
          "tool_call": false,
          "limit": { "context": 1000000, "output": 8192 }
        },
        "deepseek.r1-v1:0": {
          "name": "DeepSeek R1 (A)",
          "tool_call": false,
          "reasoning": false,
          "limit": { "context": 64000, "output": 32768 }
        },
        "mistral.pixtral-large-2502-v1:0": {
          "name": "Mistral Pixtral Large",
          "tool_call": false,
          "limit": { "context": 128000, "output": 8192 }
        },
        "meta.llama4-maverick-17b-instruct-v1:0": {
          "name": "Meta Llama 4 Maverick 17B",
          "tool_call": false,
          "limit": { "context": 1000000, "output": 8192 }
        },
        "meta.llama4-scout-17b-instruct-v1:0": {
          "name": "Meta Llama 4 Scout 17B",
          "tool_call": false,
          "limit": { "context": 10000000, "output": 8192 }
        },
        "amazon.nova-2-lite-v1:0": {
          "name": "Amazon Nova 2 Lite",
          "limit": { "context": 300000, "output": 5120 }
        }
      }
    }
  }
}
```

> **Notes on model config keys:** Config keys must match the snapshot model ID exactly (e.g. `writer.palmyra-x5-v1:0`) — the `us.` cross-region inference profile prefix is added automatically at runtime for supported models and regions. The `id` field is only needed if you want the key to differ from the API model ID.
>
> **`tool_call: false`:** Models marked with `tool_call: false` do not support tool use in streaming mode on Bedrock. This prevents opencode from sending tool definitions to those models.
>
> **`reasoning: false`:** Models marked with `reasoning: false` will have reasoning content stripped from message history before being sent to the model. Required for models like DeepSeek R1 on Bedrock that generate reasoning output but reject it as input in subsequent turns.

### 3. Shell alias

Add to `~/.zshrc` or `~/.bashrc`:

```bash
opencode-work() {
  local profile="AdministratorAccess"
  echo "Logging in to AWS SSO ($profile)..."
  aws sso login --profile "$profile" || return 1
  eval "$(aws configure export-credentials --profile "$profile" --format env)"
  /path/to/opencode/packages/opencode/dist/opencode-darwin-arm64/bin/opencode "$@"
}
```

Replace `/path/to/opencode` with where you cloned the repo (e.g. `~/Code/personal/flexion-work-items/flexchat-stack/opencode`).

### 4. Usage

```bash
# Login and launch
opencode-work

# Re-running after SSO session expires — just run again, it will re-authenticate
opencode-work
```

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
