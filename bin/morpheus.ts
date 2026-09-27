#!/usr/bin/env node

/**
 * Morpheus CLI Entry Point
 */

import { runCLI } from "../src/cli/index";

runCLI().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
