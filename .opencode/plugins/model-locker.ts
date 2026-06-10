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

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
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
    hour12: false,
  });

  const parts = formatter.formatToParts(current);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");

  const currentMinutes = hour * 60 + minute;
  const startMinutes = parseTime(start).hours * 60 + parseTime(start).minutes;
  const endMinutes = parseTime(end).hours * 60 + parseTime(end).minutes;

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
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    if (!rule.daysOfWeek.includes(dayName)) {
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

export const ModelLockerPlugin: Plugin = async ({ directory }) => {
  const configPath = join(directory, ".opencode", "model-locker.json");
  const config = loadConfig(configPath);

  if (!config) {
    return {};
  }

  return {};
};
