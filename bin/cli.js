#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENCODE_CONFIG_DIR = join(process.env.HOME || "", ".config", "opencode");
const PLUGIN_TARGET_DIR = join(OPENCODE_CONFIG_DIR, "plugins");
const CONFIG_TARGET_DIR = OPENCODE_CONFIG_DIR;

function log(msg) {
  console.log(`[model-locker] ${msg}`);
}

function error(msg) {
  console.error(`[model-locker] ERROR: ${msg}`);
  process.exit(1);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function install() {
  log("Installing model-locker plugin...");

  // Ensure plugin directory exists
  ensureDir(PLUGIN_TARGET_DIR);

  // Copy plugin file
  const pluginSrc = join(__dirname, "model-locker.js");
  const pluginDst = join(PLUGIN_TARGET_DIR, "model-locker.js");

  if (!existsSync(pluginSrc)) {
    // Try .ts version
    const pluginTsSrc = join(__dirname, "model-locker.ts");
    if (!existsSync(pluginTsSrc)) {
      error("Plugin file not found. Make sure you've built the plugin.");
    }
    log("Note: Using TypeScript source. OpenCode will compile on first load.");
    copyFileSync(pluginTsSrc, pluginDst);
  } else {
    copyFileSync(pluginSrc, pluginDst);
  }

  log(`Plugin installed to: ${pluginDst}`);

  // Check/create config
  const configSrc = join(__dirname, "model-locker.json");
  const configDst = join(CONFIG_TARGET_DIR, "model-locker.json");

  if (existsSync(configDst)) {
    log(`Config already exists at: ${configDst}`);
    log("To create a new config, delete the existing one first.");
  } else if (existsSync(configSrc)) {
    copyFileSync(configSrc, configDst);
    log(`Config installed to: ${configDst}`);
    log("Edit this file to configure your model locking rules.");
  } else {
    // Create default config
    const defaultConfig = {
      "refreshIntervalSeconds": 60,
      "targetProvider": "anthropic",
      "defaultFallbacks": ["anthropic/claude-3-5-haiku-20241022"],
      "rules": [
        {
          "id": "example-rule",
          "provider": "anthropic",
          "disabledModels": ["claude-opus-4-20250514"],
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
        }
      ]
    };

    writeFileSync(configDst, JSON.stringify(defaultConfig, null, 2));
    log(`Created default config at: ${configDst}`);
    log("Edit this file to configure your model locking rules.");
  }

  log("\n✓ Installation complete!");
  log("\nNext steps:");
  log("1. Edit your config at: " + configDst);
  log("2. Restart OpenCode");
  log("3. Use model-locker-status to check the plugin is working");
}

function uninstall() {
  log("Uninstalling model-locker plugin...");

  const pluginDst = join(PLUGIN_TARGET_DIR, "model-locker.js");
  const configDst = join(CONFIG_TARGET_DIR, "model-locker.json");

  if (existsSync(pluginDst)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(pluginDst);
    log(`Removed plugin: ${pluginDst}`);
  }

  if (existsSync(configDst)) {
    const { unlinkSync } = await import("fs");
    unlinkSync(configDst);
    log(`Removed config: ${configDst}`);
  }

  log("\n✓ Uninstall complete!");
}

// Parse command line args
const args = process.argv.slice(2);
const command = args[0] || "install";

if (command === "--install" || command === "install") {
  install();
} else if (command === "--uninstall" || command === "uninstall") {
  uninstall();
} else if (command === "--help" || command === "help") {
  console.log(`
Model Locker Plugin for OpenCode

Usage:
  opencode-model-locker --install    Install the plugin
  opencode-model-locker --uninstall  Remove the plugin
  opencode-model-locker --help       Show this help
`);
} else {
  error(`Unknown command: ${command}. Use --help for usage.`);
}