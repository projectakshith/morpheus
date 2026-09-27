import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { outlineCode, extractCodeOutline } from "../src/tools/outline";

test("outlineCode: TypeScript symbol extraction", () => {
  const tsCode = `
export interface UserSession {
  id: string;
  token: string;
}

export class AuthManager {
  login() {}
}

export async function verifyToken(raw: string, secret: string) {
  return true;
}

export const helper = (a: number) => a + 1;
`;

  const symbols = extractCodeOutline(tsCode, ".ts");
  assert.equal(symbols.length, 4);
  assert.equal(symbols[0].symbol, "export interface UserSession");
  assert.equal(symbols[1].symbol, "export class AuthManager");
  assert.match(symbols[2].symbol, /export function verifyToken/);
  assert.match(symbols[3].symbol, /export const helper/);
});

test("outlineCode: Python function and route extraction", () => {
  const pyCode = `
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

@app.post("/login")
async def login_endpoint(creds: Credentials):
    pass

class SessionHandler:
    def __init__(self):
        pass
`;

  const symbols = extractCodeOutline(pyCode, ".py");
  assert.ok(symbols.length >= 3);
  assert.match(symbols[0].symbol, /def lifespan/);
  assert.match(symbols[1].symbol, /@app\.post/);
  assert.match(symbols[2].symbol, /def login_endpoint/);
});

test("outlineCode: File execution with line numbers", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morpheus-outline-"));
  const filePath = path.join(tmpDir, "sample.py");
  await fs.writeFile(
    filePath,
    "class MyService:\n    pass\n\ndef main():\n    pass\n",
    "utf-8"
  );

  const res = await outlineCode({ filePath }, tmpDir);
  assert.match(res.output, /sample\.py \(\d+ lines, 2 symbols\):/);
  assert.match(res.output, /class MyService/);
  assert.match(res.output, /def main/);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
