const base = "http://127.0.0.1:9222";
const probeUrl = "http://127.0.0.1:4173/scripts/idb-stage8-probe.html";

const version = await (await fetch(base + "/json/version")).json();
console.log("browser", version.Browser);

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
});

let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
    }
};

function send(method, params = {}, sessionId) {
    const mid = ++id;
    return new Promise((resolve) => {
        pending.set(mid, (msg) => {
            pending.delete(mid);
            resolve(msg);
        });
        const payload = { id: mid, method, params };
        if (sessionId) {
            payload.sessionId = sessionId;
        }
        ws.send(JSON.stringify(payload));
    });
}

const created = await send("Target.createTarget", { url: probeUrl });
const targetId = created.result.targetId;
const attached = await send("Target.attachToTarget", {
    targetId,
    flatten: true
});
const sessionId = attached.result.sessionId;

await send("Runtime.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await new Promise((r) => setTimeout(r, 6000));

const evalRes = await send(
    "Runtime.evaluate",
    {
        expression: "document.getElementById('out').textContent",
        returnByValue: true
    },
    sessionId
);

console.log("OUT:\n" + (evalRes.result?.result?.value || JSON.stringify(evalRes)));
await send("Target.closeTarget", { targetId });
ws.close();
