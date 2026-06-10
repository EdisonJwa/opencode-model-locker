# Model Locker Plugin - Design Specification

**Created**: 2026-06-10
**Status**: Draft - Awaiting User Approval

## 1. Overview

Create an OpenCode plugin that automatically restricts model availability based on configurable time ranges. When models are disabled during specific hours (e.g., expensive models disabled during 13:00-19:00), they are hidden from the model catalog. A custom tool allows users to view active restrictions and manually trigger fallback model switches.

## 2. Problem Statement

- Users want to prevent usage of expensive models during peak hours to control costs
- Manual model switching is error-prone and easy to forget
- Need timezone-aware time range configuration
- Need cross-midnight range support (e.g., 22:00-06:00)

## 3. Design

### 3.1 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Model Locker Plugin                     │
├──────────────────────────────────────────────────────────┤
│  Config Loader                                            │
│  └─ Reads .opencode/model-locker.json                    │
│                                                             │
│  Time Evaluator                                            │
│  └─ Checks current time against rules                    │
│  └─ Supports timezone-aware parsing                      │
│  └─ Handles cross-midnight ranges                        │
│                                                             │
│  Catalog Transform                                        │
│  └─ Hook: catalog.transform                              │
│  └─ Filters/hides models based on time rules             │
│  └─ Runs at startup + periodic refresh (60s)             │
│                                                             │
│  Custom Tools                                             │
│  └─ model-locker-status: Show active rules               │
│  └─ model-locker-swap: Manually trigger fallback         │
│  └─ model-locker-select: TUI for easy model selection    │
│                                                             │
│  Toast Notifications                                      │
│  └─ Warns when model is disabled                         │
│                                                             │
│  TUI Selection Dialog                                     │
│  └─ Interactive picker for fallback model selection      │
│  └─ Shows model details (price, context window)          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Configuration File

**Location**: `.opencode/model-locker.json`

```json
{
  "refreshIntervalSeconds": 60,
  "defaultFallbacks": ["anthropic/claude-3-5-haiku-20241022"],
  "rules": [
    {
      "id": "work-hours-expense",
      "provider": "anthropic",
      "disabledModels": [
        "claude-sonnet-4-20250514",
        "claude-opus-4-20250514"
      ],
      "fallbackModels": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022"
      ],
      "timeRanges": [
        {
          "start": "13:00",
          "end": "19:00",
          "timezone": "America/New_York"
        }
      ],
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "enabled": true
    },
    {
      "id": "night-hours-cheap",
      "provider": "openai",
      "disabledModels": ["gpt-4o", "gpt-4-turbo"],
      "fallbackModels": ["gpt-4o-mini", "gpt-3.5-turbo"],
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

### 3.3 Configuration Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshIntervalSeconds` | number | No | How often to re-evaluate rules (default: 60) |
| `defaultFallbacks` | array | No | Default fallback models when no rule-specific fallback exists |
| `rules` | array | Yes | Array of rule objects |
| `rules[].id` | string | Yes | Unique identifier for the rule |
| `rules[].provider` | string | Yes | Provider ID (e.g., "anthropic", "openai") |
| `rules[].disabledModels` | array | Yes | List of model IDs to disable |
| `rules[].fallbackModels` | array | No | Ordered array of fallback model IDs to try in sequence |
| `rules[].timeRanges` | array | Yes | Array of time range objects |
| `rules[].timeRanges[].start` | string | Yes | Start time in HH:MM format |
| `rules[].timeRanges[].end` | string | Yes | End time in HH:MM format |
| `rules[].timeRanges[].timezone` | string | Yes | IANA timezone (e.g., "America/New_York") |
| `rules[].daysOfWeek` | array | No | Days to apply rule (default: all days) |
| `rules[].enabled` | boolean | No | Whether rule is active (default: true) |

### 3.4 Time Range Logic

**Cross-midnight support**:
- If `start > end` (e.g., 22:00-06:00), the range spans midnight
- Current time is compared using hour/minute values that wrap around

**Timezone handling**:
- Use `Intl.DateTimeFormat` with the configured timezone
- Parse times as local time in the specified timezone

**Day of week**:
- If `daysOfWeek` is specified, rule only applies on those days
- Valid values: "sunday", "monday", ..., "saturday" (lowercase, English)

### 3.5 Hooks Used

| Hook | Purpose |
|------|---------|
| `catalog.transform` | Filter models from catalog based on active rules |
| `session.created` | Show toast notification if current model is disabled |
| Custom tool: `model-locker-status` | Display active rules and current state |
| Custom tool: `model-locker-swap` | Manually switch to fallback model |

### 3.6 Custom Tools

**model-locker-status**
```typescript
// Input: none
// Output: JSON with:
// - activeRules: array of currently active rules
// - disabledModels: array of currently disabled model IDs
// - currentTime: current time in each configured timezone
// - nextStateChange: time until next state change
```

**model-locker-swap**
```typescript
// Input:
// - provider: string (provider ID)
// - modelIndex: number (optional - index in fallbackModels array, default: 0)
// Output: Success/failure message with model switched to
```

**model-locker-select (TUI Picker)**
```typescript
// Input:
// - provider: string (provider ID, optional - shows all providers if omitted)
// Output: Opens interactive TUI picker with:
//   - List of available fallback models for the current provider
//   - Model details: name, pricing (input/output), context window
//   - Keyboard navigation (arrow keys + enter to select)
//   - ESC to cancel
// Returns: Selected model ID or null if cancelled
```

### 3.8 TUI Selection Dialog Behavior

When user triggers `model-locker-select` (or clicks "Choose fallback" in toast):

1. **Provider Selection** (if no provider specified):
   - Show list of providers that have disabled models
   - Display provider name + number of disabled models

2. **Model Selection**:
   - Show fallback models for the selected provider
   - Display per model:
     - Model ID
     - Pricing: input cost + output cost per 1M tokens
     - Context window size
     - Whether model is currently available in catalog

3. **Selection**:
   - Arrow keys: Navigate model list
   - Enter: Select model and return
   - ESC: Cancel and return null

4. **On Selection**:
   - Close picker
   - Return selected model ID
   - Tool output confirms selection with model info

### 3.7 Behavior Details

**At OpenCode startup**:
1. Load config from `.opencode/model-locker.json`
2. Apply `catalog.transform` to filter disabled models
3. Start background timer for periodic re-evaluation

**On session created**:
1. Check if the session's model is currently disabled
2. If disabled, show toast with fallback suggestions in order: "Model X is disabled. Try: Model Y, Model Z"
3. User can manually switch via UI or use `model-locker-swap` tool

**On manual swap request (model-locker-swap)**:
1. Get fallback models from matching rule (in order)
2. Try each fallback model sequentially
3. Use first available model from the catalog
4. Return success with the model switched to, or error if no fallbacks available

**On timer tick (every 60s by default)**:
1. Re-evaluate all time rules
2. If state changed (model now enabled/disabled), re-apply catalog transform
3. Show notification on state change

## 4. File Structure

```
.opencode/
├── plugins/
│   └── model-locker.ts    # Main plugin entry point
├── model-locker.json      # Configuration file
└── package.json           # Dependencies (if needed)
```

## 5. Dependencies

- `@opencode-ai/plugin` - For Plugin type and tool helper
- Built-in JavaScript `Intl` API for timezone handling (no external deps needed)

## 6. Acceptance Criteria

1. **Config Loading**: Plugin loads config from `.opencode/model-locker.json` and handles missing config gracefully (no-op)

2. **Time-based Filtering**: Models specified in active rules are hidden from the catalog during their configured time ranges

3. **Timezone Support**: Times are correctly interpreted in the configured timezone

4. **Cross-midnight Ranges**: Time ranges like 22:00-06:00 correctly span midnight

5. **Day-of-Week Filtering**: Rules optionally respect day-of-week restrictions

6. **Periodic Refresh**: Catalog is re-evaluated periodically (configurable interval)

7. **Status Tool**: `model-locker-status` shows current active rules and disabled models

8. **Swap Tool**: `model-locker-swap` allows manual fallback to configured fallback model

9. **Toast Notification**: When session starts with a disabled model, a toast warns the user

10. **Graceful Degradation**: If config file is malformed, plugin logs warning and continues without blocking OpenCode

11. **Multiple Fallbacks**: When multiple fallback models are configured, `model-locker-swap` tries them in order until it finds an available model

12. **TUI Selection Dialog**: `model-locker-select` opens an interactive picker showing:
    - Provider list (if multiple providers have disabled models)
    - Fallback models with pricing and context window info
    - Keyboard navigation (arrows + enter)
    - ESC to cancel

## 7. Future Considerations (Out of Scope)

- Automatic model swapping without user intervention
- Integration with usage/cost tracking
- Support for dynamic/floating time ranges (e.g., "sunset to sunrise")
- Multiple fallback models with priority ordering