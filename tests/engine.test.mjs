import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cleanEnvironment, runChild, generate, assertLogin, ModelRpc, listModels } from "../src/core/engine.mjs";
const fixture = fileURLToPath(new URL("./fixtures/child.mjs", import.meta.url));

test("API keys, access tokens and provider URLs are removed without changing the parent", () => {
  const original = { OPENAI_API_KEY: "dummy", codex_api_key: "dummy", CODEX_ACCESS_TOKEN: "dummy", OPENAI_BASE_URL: "dummy", KEEP: "yes" };
  assert.deepEqual(cleanEnvironment(original), { KEEP: "yes" });
  assert.equal(original.OPENAI_API_KEY, "dummy");
});
test("native child stdin remains literal UTF-8, with quotes and shell metacharacters", async () => {
  const input = '日本語 café "quoted" $(never-execute) & | %PATH%';
  const result = await runChild(process.execPath, [fixture, "echo"], { input });
  assert.equal(result.code, 0); assert.equal(result.stdout, input);
});
test("child failures are captured without treating stderr as a response", async () => {
  const result = await runChild(process.execPath, [fixture, "fail"]);
  assert.equal(result.code, 7); assert.equal(result.stdout, "");
});
test("timeout kills the native child", async () => await assert.rejects(runChild(process.execPath, [fixture, "hang"], { timeout: 80 }), /timed out/));
test("Stop cancels a running child", async () => {
  const controller = new AbortController();
  const result = runChild(process.execPath, [fixture, "hang"], { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(result, /stopped/);
});
test("an already cancelled request starts no child", async () => {
  await assert.rejects(runChild(process.execPath, [fixture], { signal: AbortSignal.abort(), spawnImpl: () => assert.fail("must not spawn") }), /stopped/);
});
test("saved ChatGPT login is accepted and API-key login is refused", async () => {
  const adapter = (mode) => ({ spawnImpl: () => spawn(process.execPath, [fixture, mode], { stdio: ["pipe", "pipe", "pipe"] }) });
  await assertLogin("fake.exe", adapter("login-chat"));
  await assert.rejects(assertLogin("fake.exe", adapter("login-api")), /Sign in to Codex with ChatGPT/);
});
test("generation passes explicit model, schema and stdin and cleans its temporary folder", async () => {
  let directory;
  const expected = { response: "A short explanation.", replacement: 'He said "hello".' };
  const reply = await generate({ executable: "fake.exe", model: "chosen-model", mode: "rewrite", prompt: "source", checkLogin: async () => {},
    run: async (_exe, args, options) => {
      directory = options.cwd;
      assert.equal(options.input, "source");
      assert.equal(args[args.indexOf("--model") + 1], "chosen-model");
      assert.ok(args.includes("--ignore-user-config") && args.includes("--ephemeral"));
      assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
      const schema = JSON.parse(await readFile(args[args.indexOf("--output-schema") + 1], "utf8"));
      assert.equal(schema.additionalProperties, false);
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(expected));
      return { code: 0 };
    } });
  assert.deepEqual(reply, expected);
  await assert.rejects(stat(directory), { code: "ENOENT" });
});
test("failed generation never returns stderr as replacement and still cleans temp data", async () => {
  let directory;
  await assert.rejects(generate({ executable: "fake.exe", prompt: "source", checkLogin: async () => {}, run: async (_exe, _args, options) => {
    directory = options.cwd; return { code: 9, stderr: "secret prompt must not be shown" };
  } }), (error) => !error.message.includes("secret prompt") && error.message.includes("Nothing was replaced"));
  await assert.rejects(stat(directory), { code: "ENOENT" });
});
test("successful exit without a final reply is rejected", async () => {
  await assert.rejects(generate({ executable: "fake.exe", prompt: "source", checkLogin: async () => {}, run: async () => ({ code: 0 }) }), /did not produce/);
});
test("generation needs one process and still forces ChatGPT authentication", async () => {
  let calls = 0;
  const reply = await generate({ executable: "fake.exe", prompt: "source", run: async (_exe, args) => {
    calls++;
    assert.ok(args.includes('forced_login_method="chatgpt"'));
    assert.ok(args.includes('model_provider="openai"'));
    await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ response: "answer", replacement: null }));
    return { code: 0 };
  } });
  assert.equal(calls, 1); assert.equal(reply.response, "answer");
});
test("model discovery follows initialization, filters hidden models and follows pagination", async () => {
  const models = await listModels("fake.exe", { checkLogin: async () => {}, spawnImpl: () => spawn(process.execPath, [fixture, "rpc"], { stdio: ["pipe", "pipe", "pipe"] }) });
  assert.deepEqual(models.map((m) => m.id), ["first", "second"]);
});
test("RPC errors and timeouts reject pending calls and can be disposed", async () => {
  const child = spawn(process.execPath, [fixture, "rpc"], { stdio: ["pipe", "pipe", "pipe"] });
  const rpc = new ModelRpc(child);
  try {
    await rpc.request("initialize", {});
    await assert.rejects(rpc.request("fail", {}), /discovery failed/);
    await assert.rejects(rpc.request("no-reply", {}, 50), /timed out/);
  } finally { rpc.close(); }
});
