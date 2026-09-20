import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const recorderRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(recorderRoot, "..", "web", "src");

async function collectTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(p);
    }
  }
  await walk(dir);
  return out;
}

/** Strip line and block comments so doc warnings do not trip the ban. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("programmatic verify uses Arc/Base RPC only — no explorer HTTP API", () => {
  it("recorder + web code never calls explorer.arc.io/api", async () => {
    const files = [
      ...(await collectTs(path.join(recorderRoot, "src"))),
      ...(await collectTs(webRoot)),
    ];
    assert.ok(files.length > 0, "expected source files");
    for (const file of files) {
      const text = stripComments(await fs.readFile(file, "utf8"));
      assert.equal(
        /explorer\.arc\.io\/api/i.test(text),
        false,
        `${file} must not depend on explorer.arc.io/api; use https://rpc.mainnet.arc.io`,
      );
      assert.equal(
        /fetch\(\s*[`'"]https?:\/\/explorer\.arc\.io/i.test(text),
        false,
        `${file} must not fetch explorer.arc.io for verify`,
      );
    }
  });

  it("web ledger reads via createPublicClient + readContract (RPC)", async () => {
    const proofs = await fs.readFile(path.join(webRoot, "lib", "proofs.ts"), "utf8");
    const code = stripComments(proofs);
    assert.match(code, /createPublicClient/);
    assert.match(code, /readContract/);
    assert.equal(/explorer\.arc\.io\/api/i.test(code), false);
    assert.match(proofs, /rpc\.mainnet\.arc\.io|arcRpcUrl|NEXT_PUBLIC_ARC_RPC/);
  });
});
