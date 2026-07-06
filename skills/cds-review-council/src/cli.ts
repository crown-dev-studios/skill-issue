#!/usr/bin/env node

import { main } from "./orchestrate-review-council.js";

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
