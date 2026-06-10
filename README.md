# Model Locker Plugin for OpenCode

[![npm version](https://img.shields.io/npm/v/opencode-model-locker)](https://www.npmjs.com/package/opencode-model-locker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Automatically restrict model availability based on configurable time ranges. Great for limiting expensive models during work hours or peak times.

## Features

- **Pattern-based model filtering** - Use wildcards like `provider/*` or `*` to disable all models
- **Multiple fallback models** - Priority-ordered fallback list
- **Timezone-aware** - Use any IANA timezone (e.g., "America/New_York", "UTC")
- **Cross-midnight support** - Configure ranges like "22:00-06:00"
- **Day-of-week filtering** - Apply rules only on specific days
- **Interactive tools**:
  - `model-locker-status` - View active rules with beautiful formatting
  - `model-locker-swap` - Get fallback model recommendations  
  - `model-locker-select` - List available fallback models
  - `model-locker-setup` - Quick setup wizard to generate config

## Installation

### Via npm (recommended)

```bash
npm install -g opencode-model-locker
```

Then add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-model-locker"]
}
```

## Quick Start

### 1. Run the setup wizard

```
Use model-locker-setup tool with provider: "anthropic"
```

This generates a ready-to-use configuration!

### 2. Or create config manually

Create `.opencode/model-locker.json`:

```json
{
  "rules": [
    {
      "id": "work-hours",
      "provider": "anthropic",
      "disabledModels": ["*"],
      "fallbackModels": ["claude-3-5-haiku-20241022"],
      "timeRanges": [
        {
          "start": "09:00",
          "end": "18:00",
          "timezone": "America/New_York"
        }
      ],
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "enabled": true
    }
  ]
}
```

## Usage

### Check Status

```
Use model-locker-status tool
```

Shows:
- Current time
- Active rules with details
- Disabled models
- Configured fallbacks

### Get Fallback Recommendation

```
Use model-locker-swap tool with provider: "anthropic"
```

Returns a recommended fallback model with instructions.

### List Available Fallbacks

```
Use model-locker-select tool with provider: "anthropic"
```

Shows all available fallback models with descriptions.

### Quick Setup

```
Use model-locker-setup tool with provider: "openai"
```

Generates a ready-to-use config you can copy.

## Pattern Syntax for `disabledModels`

| Pattern | Example | Matches |
|---------|---------|---------|
| `*` | `"*"` | All models (disables entire provider) |
| `provider/*` | `"openai/*"` | All models from that provider |
| Specific model | `"gpt-4o"` | Only that exact model |

## Common Configurations

### Disable all models during work hours

```json
{
  "rules": [{
    "id": "work-hours",
    "provider": "anthropic",
    "disabledModels": ["*"],
    "fallbackModels": ["claude-3-5-haiku-20241022"],
    "timeRanges": [{ "start": "09:00", "end": "18:00", "timezone": "America/New_York" }],
    "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }]
}
```

### Disable specific expensive models

```json
{
  "rules": [{
    "id": "expensive",
    "provider": "anthropic",
    "disabledModels": ["claude-opus-4-20250514", "claude-sonnet-4-20250514"],
    "fallbackModels": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    "timeRanges": [{ "start": "09:00", "end": "18:00", "timezone": "America/New_York" }]
  }]
}
```

## API Limitations

- **Single provider filter**: OpenCode's plugin API only supports filtering ONE provider per plugin.

## License

MIT