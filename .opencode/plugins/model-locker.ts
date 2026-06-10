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
  disabledModels: string[];
  fallbackModels?: string[];
  timeRanges: TimeRange[];
  daysOfWeek?: string[];
  enabled?: boolean;
}

export interface ModelLockerConfig {
  refreshIntervalSeconds?: number;
  defaultFallbacks?: string[];
  targetProvider?: string;
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

function getDisabledModelsByProvider(config: ModelLockerConfig): Record<string, Set<string>> {
  const activeRules = getActiveRules(config);
  const disabledByProvider: Record<string, Set<string>> = {};
  for (const rule of activeRules) {
    if (!disabledByProvider[rule.provider]) {
      disabledByProvider[rule.provider] = new Set<string>();
    }
    for (const modelId of rule.disabledModels) {
      disabledByProvider[rule.provider].add(modelId);
    }
  }
  return disabledByProvider;
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
          return JSON.stringify({
            activeRules: [],
            disabledModels: [],
            currentTime: new Date().toISOString(),
            error: "No config loaded",
          }, null, 2);
        }

        const activeRules = getActiveRules(config);
        const disabledModels = activeRules.flatMap(r => r.disabledModels);

        return JSON.stringify({
          activeRules: activeRules.map(r => ({
            id: r.id,
            provider: r.provider,
            disabledModels: r.disabledModels,
            fallbackModels: r.fallbackModels || config.defaultFallbacks || [],
          })),
          disabledModels,
          currentTime: new Date().toISOString(),
        }, null, 2);
      },
    }),
    "model-locker-select": tool({
      description: "List available fallback models for selection",
      args: {
        provider: tool.schema.string().optional(),
      },
      async execute(args) {
        if (!config) {
          return JSON.stringify({ success: false, message: "No config loaded", options: [] });
        }

        const activeRules = getActiveRules(config);
        const options: Array<{ label: string; value: string; description: string }> = [];

        for (const rule of activeRules) {
          if (args.provider && rule.provider !== args.provider) continue;
          const fallbacks = rule.fallbackModels || config.defaultFallbacks || [];
          for (const model of fallbacks) {
            options.push({
              label: `${rule.provider}/${model}`,
              value: model,
              description: `Fallback for ${rule.provider}`,
            });
          }
        }

        if (options.length === 0) {
          return JSON.stringify({
            success: false,
            message: "No fallback models available. Use model-locker-status to see current state.",
            options: [],
          });
        }

        return JSON.stringify({
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
          return JSON.stringify({ success: false, message: "No config loaded" });
        }

        const activeRules = getActiveRules(config);
        const matchingRule = activeRules.find(r => r.provider === provider);

        if (!matchingRule) {
          return JSON.stringify({ success: false, message: `No active rule for provider: ${provider}` });
        }

        const fallbacks = matchingRule.fallbackModels || config.defaultFallbacks || [];
        const targetModel = fallbacks[modelIndex];

        if (!targetModel) {
          return JSON.stringify({
            success: false,
            message: `No fallback model at index ${modelIndex}. Available: ${fallbacks.join(", ")}`,
          });
        }

        return JSON.stringify({
          success: true,
          message: `Recommended model: ${targetModel}`,
          model: targetModel,
          provider,
        });
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
      `[model-locker] WARNING: The OpenCode plugin API supports only ONE provider hook per plugin. ` +
      `Found active rules for providers: ${providerIds.join(", ")}. ` +
      `Set "targetProvider" in config to choose which provider to filter. ` +
      `Defaulting to "${config.targetProvider || providerIds[0]}".`
    );
  }

  let targetProviderId: string;
  if (config.targetProvider) {
    if (!disabledByProvider[config.targetProvider]) {
      console.warn(
        `[model-locker] Configured targetProvider "${config.targetProvider}" has no active rules. ` +
        `Available providers with active rules: ${providerIds.join(", ")}. Skipping.`
      );
      return { tool: tools };
    }
    targetProviderId = config.targetProvider;
  } else {
    targetProviderId = providerIds[0];
    if (providerIds.length > 1) {
      console.warn(
        `[model-locker] No targetProvider configured. Using "${targetProviderId}" (first provider with active rules). ` +
        `Providers with active rules but NOT filtered: ${providerIds.slice(1).join(", ")}.`
      );
    }
  }

  const providerHook: ProviderHook = {
    id: targetProviderId,
    models: async (provider, _ctx) => {
      const disabled = disabledByProvider[targetProviderId] || new Set<string>();
      const allModels = provider.models || {};
      const filtered: Record<string, ModelV2> = {};
      for (const [modelId, model] of Object.entries(allModels)) {
        if (!disabled.has(modelId)) {
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
  };
};
