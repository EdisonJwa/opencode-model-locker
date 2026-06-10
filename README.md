# Model Locker Plugin for OpenCode

Automatically restrict model availability based on configurable time ranges.

## Features

- Time-based model filtering using OpenCode's `provider` hook
- Multiple fallback models with priority ordering
- Timezone-aware configuration
- Cross-midnight time range support
- Day-of-week filtering
- Custom tools:
  - `model-locker-status`: View active rules and disabled models
  - `model-locker-swap`: Get fallback model recommendations
  - `model-locker-select`: List available fallback models
- Session notifications when model restrictions are active
- Periodic refresh for dynamic time-based behavior

## Installation

1. Copy plugin to `.opencode/plugins/model-locker.ts`
2. Create config at `.opencode/model-locker.json`
3. Restart OpenCode

## Configuration

See `.opencode/model-locker.json` for the configuration schema.

## Usage

- Models are automatically hidden during configured time ranges
- Use `model-locker-status` to see current state
- Use `model-locker-select` to list available fallback models
- Use `model-locker-swap` to get a fallback model recommendation

## API Limitations

- Only ONE provider can be filtered per plugin (OpenCode API limitation)
- Use `targetProvider` config option to specify which provider to filter
- Actual model switching requires manual user action
