#!/usr/bin/env node

const userAgent = process.env.npm_config_user_agent ?? "";

if (userAgent.startsWith("pnpm/")) {
  process.exit(0);
}

console.error("This repo uses pnpm.");
console.error("Run `pnpm install` instead of npm or yarn.");
process.exit(1);
