import test from "node:test";
import assert from "node:assert/strict";
import { discoverSeraphServer } from "../src/tools/mcp";
import { MATRIX_PROGRAMS } from "../src/core/programs/registry";

test("Seraph Integration: discoverSeraphServer finds local executable or python venv", () => {
  // Discover Seraph on host environment
  const server = discoverSeraphServer();
  // If seraph is installed locally (in ~/.local/bin or Developer/seraph), it should be discovered
  if (server) {
    assert.ok(server.command, "Discovered server must have a command");
    assert.match(server.command, /seraph|python/);
  }
});

test("Seraph Integration: Merovingian and Keymaker directives prioritize Seraph code intelligence", () => {
  const merovingian = MATRIX_PROGRAMS.merovingian;
  assert.ok(
    merovingian.operationalRules.some((r) => r.includes("mcp_seraph_find_dependencies")),
    "Merovingian must be instructed to use Seraph dependency analysis"
  );
  assert.ok(
    merovingian.operationalRules.some((r) => r.includes("mcp_seraph_change_impact")),
    "Merovingian must be instructed to use Seraph change impact"
  );

  const keymaker = MATRIX_PROGRAMS.keymaker;
  assert.ok(
    keymaker.operationalRules.some((r) => r.includes("mcp_seraph_find_symbol")),
    "Keymaker must be instructed to use Seraph symbol discovery"
  );

  const sati = MATRIX_PROGRAMS.sati;
  assert.ok(
    sati.operationalRules.some((r) => r.includes("mcp_seraph_change_impact")),
    "Sati must be instructed to check Seraph impact before concluding"
  );
});
