import type { Plugin } from "@opencode-ai/plugin";
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

export const ModelLockerPlugin: Plugin = async ({ directory }) => {
  const configPath = join(directory, ".opencode", "model-locker.json");
  const config = loadConfig(configPath);

  if (!config) {
    return {};
  }

  return {};
};
