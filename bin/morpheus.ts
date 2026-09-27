#!/usr/bin/env node

/**
 * Morpheus CLI Entry Point
 */

import { runCLI } from "../src/cli/index.js";

runCLI().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
