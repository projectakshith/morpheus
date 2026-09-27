#!/usr/bin/env node

/**
 * Morpheus CLI Entry Point
 */

import { MORPHEUS_VERSION } from "../src/index.js";

function main() {
  console.log(`\x1b[32m[MORPHEUS]\x1b[0m Initialized v${MORPHEUS_VERSION}`);
  console.log("Welcome to the real world.");
}

main();
