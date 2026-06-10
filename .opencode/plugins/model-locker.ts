import { tool } from "@opencode-ai/plugin";
import type { Plugin, ProviderHook } from "@opencode-ai/plugin";
import type { Provider as ProviderV2, Model as ModelV2 } from "@opencode-ai/sdk/v2";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface TimeRange {
  start: string;
  end: string;
  timezone: string;
}

export interface Rule {
  id: string;
  provider: string;
  disabledModels: string[];  // e.g., ["anthropic/claude-opus-4", "openai/*", "gpt-4-turbo"]
  fallbackModels?: string[];
  timeRanges: TimeRange[];
  daysOfWeek?: string[];
  enabled?: boolean;
}

export interface ModelLockerConfig {
  refreshIntervalSeconds?: number;
  rules: Rule[];
}

function loadConfig(configPath: string): ModelLockerConfig | null {
  try {
    if (!existsSync(configPath)) {
      console.warn("[model-locker] Config file not found, skipping");
      return null;
    }
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as ModelLockerConfig;
    if (!config.rules || !Array.isArray(config.rules)) {
      console.warn("[model-locker] Invalid config: missing rules array");
      return null;
    }
    return config;
  } catch (error) {
    console.warn("[model-locker] Failed to load config:", error);
    return null;
  }
}

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(timeStr);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function isTimeInRange(
  current: Date,
  start: string,
  end: string,
  timezone: string
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(current);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");

  const startParsed = parseTime(start);
  const endParsed = parseTime(end);
  if (!startParsed || !endParsed) return false;

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startParsed.hours * 60 + startParsed.minutes;
  const endMinutes = endParsed.hours * 60 + endParsed.minutes;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function isRuleActive(rule: Rule): boolean {
  if (rule.enabled === false) return false;

  const now = new Date();

  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const dayMatch = rule.timeRanges.some(range => {
      const dayName = new Intl.DateTimeFormat("en-US", {
        timeZone: range.timezone,
        weekday: "long",
      }).format(now).toLowerCase();
      return rule.daysOfWeek!.includes(dayName);
    });
    if (!dayMatch) {
      return false;
    }
  }

  return rule.timeRanges.some(range =>
    isTimeInRange(now, range.start, range.end, range.timezone)
  );
}

function getActiveRules(config: ModelLockerConfig): Rule[] {
  return config.rules.filter(isRuleActive);
}

function getDisabledModelsByProvider(config: ModelLockerConfig): Record<string, string[]> {
  const activeRules = getActiveRules(config);
  const disabledByProvider: Record<string, string[]> = {};
  for (const rule of activeRules) {
    if (!disabledByProvider[rule.provider]) {
      disabledByProvider[rule.provider] = [];
    }
    for (const modelId of rule.disabledModels) {
      if (!disabledByProvider[rule.provider].includes(modelId)) {
        disabledByProvider[rule.provider].push(modelId);
      }
    }
  }
  return disabledByProvider;
}

function isAllModelsDisabled(config: ModelLockerConfig, providerId: string): boolean {
  const activeRules = getActiveRules(config);
  const rule = activeRules.find(r => r.provider === providerId);
  if (!rule) return false;
  return rule.disabledModels.some(m => m === "*" || m === `${providerId}/*`);
}

function isModelDisabled(modelId: string, disabledPatterns: string[], providerId: string): boolean {
  for (const pattern of disabledPatterns) {
    if (pattern === "*") return true;
    if (pattern === `${providerId}/*`) return true;
    if (pattern === modelId) return true;
    if (pattern.includes("/") && modelId.startsWith(pattern.replace(/\*$/, ""))) return true;
  }
  return false;
}

export const ModelLockerPlugin: Plugin = async ({ directory }) => {
  const configPath = join(directory, ".opencode", "model-locker.json");
  const config = loadConfig(configPath);

  const tools = {
    "model-locker-status": tool({
      description: "Show current model locker status, active rules, and disabled models",
      args: {},
      async execute() {
        if (!config) {
          return `📋 Model Locker Status

❌ No configuration loaded
💡 Create .opencode/model-locker.json to get started`;
        }

        const activeRules = getActiveRules(config);
        
        if (activeRules.length === 0) {
          return `📋 Model Locker Status

✅ No active restrictions
💡 Configure time-based rules in model-locker.json`;
        }

        let output = `📋 Model Locker Status

🕐 Current time: ${new Date().toLocaleTimeString()}
`;
        
        for (const rule of activeRules) {
          const timeInfo = rule.timeRanges.map(t => 
            `${t.start}-${t.end} (${t.timezone})`
          ).join(", ");
          
          output += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 Rule: ${rule.id}
📦 Provider: ${rule.provider}
⏰ Time: ${timeInfo}
${rule.daysOfWeek ? `📅 Days: ${rule.daysOfWeek.join(", ")}` : "📅 Days: All"}
❌ Disabled: ${rule.disabledModels.join(", ")}
🔄 Fallbacks: ${(rule.fallbackModels || []).join(" → ") || "None"}
`;
        }
        
        return output;
      },
    }),
    "model-locker-select": tool({
      description: "Select a fallback model interactively",
      args: {
        provider: tool.schema.string().optional(),
      },
      async execute(args) {
        if (!config) {
          return `❌ No config loaded. Create .opencode/model-locker.json first.`;
        }

        const activeRules = getActiveRules(config);
        const options: Array<{ label: string; value: string; description: string }> = [];

        for (const rule of activeRules) {
          if (args.provider && rule.provider !== args.provider) continue;
          const fallbacks = rule.fallbackModels || [];
          for (const model of fallbacks) {
            options.push({
              label: `${rule.provider}/${model}`,
              value: model,
              description: `Use ${model} instead of disabled models`,
            });
          }
        }

        if (options.length === 0) {
          return `📦 Available Fallbacks

❌ No fallback models configured
💡 Add fallbackModels to your rules in model-locker.json`;
        }

        let output = `📦 Available Fallback Models

Select a model to use, then run model-locker-swap:
`;
        for (let i = 0; i < options.length; i++) {
          output += `
${i + 1}. ${options[i].label}
   💡 ${options[i].description}
`;
        }
        
        output += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 To switch, run:
   model-locker-swap with provider and modelIndex`;
        
        return output;
      },
    }),
          success: true,
          message: "Available fallback models. Use model-locker-swap to switch.",
          options,
          instruction: "Run model-locker-swap with provider and modelIndex to switch.",
        });
      },
    }),
    "model-locker-swap": tool({
      description: "Swap to a fallback model for the given provider",
      args: {
        provider: tool.schema.string(),
        modelIndex: tool.schema.number().optional(),
      },
      async execute(args) {
        const { provider, modelIndex = 0 } = args;

        if (!config) {
          return `❌ No config loaded`;
        }

        const activeRules = getActiveRules(config);
        const matchingRule = activeRules.find(r => r.provider === provider);

        if (!matchingRule) {
          return `❌ No active restriction for provider: ${provider}

💡 Run model-locker-status to see available providers`;
        }

        const fallbacks = matchingRule.fallbackModels || [];
        const targetModel = fallbacks[modelIndex];

        if (!targetModel) {
          let msg = `❌ No fallback at index ${modelIndex}\n\n`;
          msg += `📦 Available fallbacks for ${provider}:\n`;
          fallbacks.forEach((m, i) => {
            msg += `   ${i}: ${m}\n`;
          });
          msg += `\n💡 Try: model-locker-swap with provider: "${provider}", modelIndex: 0`;
          return msg;
        }

        return `✅ Recommended Fallback

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Switch to: ${provider}/${targetModel}

💡 To activate this model in OpenCode:
   1. Run the model picker (Cmd+M or via UI)
   2. Select ${targetModel}
   3. The model will be used for subsequent requests
`;
      },
    }),
    "model-locker-setup": tool({
      description: "Interactive setup wizard to create a basic config",
      args: {
        provider: tool.schema.string(),
        startTime: tool.schema.string(),
        endTime: tool.schema.string(),
        timezone: tool.schema.string(),
      },
      async execute(args) {
        const { provider = "anthropic", startTime = "09:00", endTime = "18:00", timezone = "America/New_York" } = args;
        
        const fallbackMap: Record<string, string> = {
          anthropic: "claude-3-5-haiku-20241022",
          openai: "gpt-4o-mini",
          google: "gemini-2.0-flash-exp",
          xai: "grok-2-2025-01-16",
        };
        
        const fallback = fallbackMap[provider] || "default-model";
        
        return `🔧 Model Locker Setup

Here's a ready-to-use configuration:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "rules": [
    {
      "id": "${provider}-work-hours",
      "provider": "${provider}",
      "disabledModels": ["*"],
      "fallbackModels": ["${fallback}"],
      "timeRanges": [
        {
          "start": "${startTime}",
          "end": "${endTime}",
          "timezone": "${timezone}"
        }
      ],
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "enabled": true
    }
  ]
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 Copy this to .opencode/model-locker.json

⚙️ Parameters used:
   Provider: ${provider}
   Time: ${startTime} - ${endTime} (${timezone})
   Fallback: ${fallback}
`;
      },
    }),
  };

  if (!config) {
    return { tool: tools };
  }

  const disabledByProvider = getDisabledModelsByProvider(config);
  const providerIds = Object.keys(disabledByProvider);

  if (providerIds.length === 0) {
    return { tool: tools };
  }

  if (providerIds.length > 1) {
    console.warn(
      `[model-locker] OpenCode plugin API supports only ONE provider filter. ` +
      `Found active rules for: ${providerIds.join(", ")}. Using "${providerIds[0]}".`
    );
  }

  const targetProviderId = providerIds[0];

  const providerHook: ProviderHook = {
    id: targetProviderId,
    models: async (provider, _ctx) => {
      const disabledPatterns = disabledByProvider[targetProviderId] || [];
      const allModels = provider.models || {};
      const filtered: Record<string, ModelV2> = {};
      for (const [modelId, model] of Object.entries(allModels)) {
        if (!isModelDisabled(modelId, disabledPatterns, targetProviderId)) {
          filtered[modelId] = model;
        }
      }
      console.log(`[model-locker] Filtered ${Object.keys(allModels).length - Object.keys(filtered).length} models for ${targetProviderId}`);
      return filtered;
    },
  };

  return {
    provider: providerHook,
    tool: tools,
    "session.created": async () => {
      const activeRules = getActiveRules(config);
      if (activeRules.length > 0) {
        console.log(
          `[model-locker] Active restrictions: ${activeRules.map(r => r.id).join(", ")}. ` +
          `Use model-locker-status to see details.`
        );
      }
    },
  };
};
