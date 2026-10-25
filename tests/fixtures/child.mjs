import { createInterface } from "node:readline";
const mode = process.argv[2];
if (mode === "rpc") {
  for await (const line of createInterface({ input: process.stdin })) {
    const m = JSON.parse(line);
    if (!m.id) continue;
    if (m.method === "initialize") console.log(JSON.stringify({ id: m.id, result: {} }));
    else if (m.method === "model/list") console.log(JSON.stringify({ id: m.id, result: m.params.cursor ? {
      data: [{ model: "second", displayName: "Second model", hidden: false }], nextCursor: null,
    } : { data: [{ model: "first", displayName: "First model", hidden: false }, { model: "hidden", hidden: true }], nextCursor: "page2" } }));
    else if (m.method === "fail") console.log(JSON.stringify({ id: m.id, error: { message: "not exposed" } }));
    // Deliberately no reply for timeout tests.
  }
} else {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  if (mode === "echo") process.stdout.write(text);
  else if (mode === "fail") { process.stderr.write("dummy sensitive stderr"); process.exitCode = 7; }
  else if (mode === "hang") await new Promise((resolve) => setTimeout(resolve, 30000));
  else if (mode === "env") console.log(JSON.stringify({ apiKeyPresent: !!process.env.OPENAI_API_KEY, codexKeyPresent: !!process.env.CODEX_API_KEY, accessTokenPresent: !!process.env.CODEX_ACCESS_TOKEN }));
  else if (mode === "login-chat") process.stderr.write("Logged in using ChatGPT");
  else if (mode === "login-api") process.stderr.write("Logged in using an API key");
}
