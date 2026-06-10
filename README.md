# Model Locker Plugin for OpenCode

[![npm version](https://img.shields.io/npm/v/opencode-model-locker)](https://www.npmjs.com/package/opencode-model-locker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Automatically restrict model availability based on configurable time ranges. Great for limiting expensive models during work hours or peak times.

## Features

- **Time-based model filtering** - Automatically hide expensive models during configured hours
- **Multiple fallback models** - Priority-ordered fallback list
- **Timezone-aware** - Use any IANA timezone (e.g., "America/New_York", "UTC")
- **Cross-midnight support** - Configure ranges like "22:00-06:00"
- **Day-of-week filtering** - Apply rules only on specific days
- **Custom tools** for interaction:
  - `model-locker-status` - View active rules and disabled models
  - `model-locker-swap` - Get fallback model recommendations
  - `model-locker-select` - List available fallback models
- **Session notifications** - Warn when restrictions are active

## Installation

### Option 1: Via npm (recommended)

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

### Option 2: Local plugin (development)

```bash
# Clone this repo
git clone https://github.com/EdisonJwa/opencode-model-locker.git
cd opencode-model-locker

# Copy to project or global plugin directory
cp -r .opencode ~/path-to-your-project/.opencode/
# OR for global installation:
mkdir -p ~/.config/opencode/plugins
cp .opencode/plugins/model-locker.ts ~/.config/opencode/plugins/
```

## Configuration

Create `.opencode/model-locker.json` in your project or `~/.config/opencode/` for global:

```json
{
  "refreshIntervalSeconds": 60,
  "targetProvider": "anthropic",
  "defaultFallbacks": ["anthropic/claude-3-5-haiku-20241022"],
  "rules": [
    {
      "id": "work-hours-expense",
      "provider": "anthropic",
      "disabledModels": ["claude-sonnet-4-20250514", "claude-opus-4-20250514"],
      "fallbackModels": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
      "timeRanges": [
        {
          "start": "09:00",
          "end": "17:00",
          "timezone": "America/New_York"
        }
      ],
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "enabled": true
    },
    {
      "id": "night-cheap",
      "provider": "openai",
      "disabledModels": ["gpt-4o"],
      "fallbackModels": ["gpt-4o-mini"],
      "timeRanges": [
        {
          "start": "22:00",
          "end": "06:00",
          "timezone": "UTC"
        }
      ],
      "enabled": true
    }
  ]
}
```

### Configuration Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshIntervalSeconds` | number | No | How often to re-evaluate rules (default: 60) |
| `targetProvider` | string | No | Which provider to filter (OpenCode API limits to one) |
| `defaultFallbacks` | array | No | Default fallback models when rule has none |
| `rules` | array | Yes | Array of rule objects |

### Rule Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the rule |
| `provider` | string | Yes | Provider ID (e.g., "anthropic", "openai") |
| `disabledModels` | array | Yes | Model IDs to disable during time ranges |
| `fallbackModels` | array | No | Priority-ordered fallback model IDs |
| `timeRanges` | array | Yes | Array of time range objects |
| `timeRanges[].start` | string | Yes | Start time "HH:MM" |
| `timeRanges[].end` | string | Yes | End time "HH:MM" |
| `timeRanges[].timezone` | string | Yes | IANA timezone (e.g., "America/New_York") |
| `daysOfWeek` | array | No | Days to apply rule (lowercase: "monday", etc.) |
| `enabled` | boolean | No | Whether rule is active (default: true) |

## Usage

After installation, the plugin automatically filters models based on your configuration.

### Check Status

```
Use model-locker-status tool
```

Shows active rules, disabled models, and current time.

### List Available Fallbacks

```
Use model-locker-select tool with provider: "anthropic"
```

Lists fallback models for the specified provider.

### Get Swap Recommendation

```
Use model-locker-swap tool with provider: "anthropic"
```

Returns a recommended fallback model to use.

## API Limitations

- **Single provider limit**: OpenCode's plugin API only supports filtering ONE provider per plugin. Use `targetProvider` in config to specify which provider.
- **Manual model switching**: Actual model switching requires manual user action (OpenCode doesn't expose model swap API to plugins)

## Common Configurations

### Disable GPT-4 at night (UTC)

```json
{
  "targetProvider": "openai",
  "rules": [{
    "id": "night-disable",
    "provider": "openai",
    "disabledModels": ["gpt-4o", "gpt-4-turbo"],
    "fallbackModels": ["gpt-4o-mini"],
    "timeRanges": [{ "start": "22:00", "end": "06:00", "timezone": "UTC" }]
  }]
}
```

### Work hours restriction (Eastern Time)

```json
{
  "targetProvider": "anthropic",
  "defaultFallbacks": ["anthropic/claude-3-5-haiku-20241022"],
  "rules": [{
    "id": "work-hours",
    "provider": "anthropic",
    "disabledModels": ["claude-opus-4-20250514"],
    "fallbackModels": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    "timeRanges": [{ "start": "09:00", "end": "18:00", "timezone": "America/New_York" }],
    "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }]
}
```

## License

MIT