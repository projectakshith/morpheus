#!/usr/bin/env node

/**
 * Morpheus CLI Entry Point
 */

/* Subcommands load lazily so the daemon never pulls Ink/React into memory. */
const [command, ...rest] = process.argv.slice(2);

const main =
  command === "serve"
    ? import("../src/server/cli.js").then((m) => m.runServe(rest))
    : import("../src/cli/index.js").then((m) => m.runCLI());

main.catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
