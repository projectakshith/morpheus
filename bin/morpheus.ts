#!/usr/bin/env node

/**
 * Morpheus CLI Entry Point
 */

const [command, ...rest] = process.argv.slice(2);

const main =
  command === "serve"
    ? import("../src/server/cli").then((m) => m.runServe(rest))
    : import("../src/cli/index").then((m) => m.runCLI());

main.catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
