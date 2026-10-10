#!/usr/bin/env node

// Register the TypeScript loader before importing the CLI entrypoint. This
// keeps the published/local binary usable when package managers invoke it
// directly with Node (including Bun's linked-package bin shim).
import { register } from "tsx/esm/api";

register();
await import("./morpheus.ts");
