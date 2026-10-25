import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { permissionReason } from "../src/core/permissions";

describe("permissionReason", () => {
  it("allows routine shell commands without approval", async () => {
    assert.equal(await permissionReason("bash", { command: "date" }, process.cwd()), null);
    assert.equal(await permissionReason("bash", { command: "npm run typecheck" }, process.cwd()), null);
    assert.equal(await permissionReason("bash", { command: "echo done" }, process.cwd()), null);
  });

  it("requires approval for destructive or high-impact shell commands", async () => {
    assert.ok(await permissionReason("bash", { command: "rm -rf build" }, process.cwd()));
    assert.ok(await permissionReason("bash", { command: "git push origin main" }, process.cwd()));
    assert.ok(await permissionReason("bash", { command: "npm publish" }, process.cwd()));
  });

  it("allows read-only HTTP requests and gates mutations", async () => {
    assert.equal(await permissionReason("http_request", { method: "GET" }, process.cwd()), null);
    assert.ok(await permissionReason("http_request", { method: "DELETE" }, process.cwd()));
    assert.equal(await permissionReason("http_probe", { method: "HEAD" }, process.cwd()), null);
    assert.ok(await permissionReason("http_probe", { method: "POST" }, process.cwd()));
  });
});
