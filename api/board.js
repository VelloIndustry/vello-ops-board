const KEY = "vello-ops-board";

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvHeaders() {
  return {
    Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
    "Content-Type": "application/json"
  };
}

async function kvCommand(command) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: kvHeaders(),
    body: JSON.stringify(command)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.error || json.message || "KV request failed";
    throw new Error(message);
  }
  return json.result;
}

function todayBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function send(res, status, body) {
  res.statusCode = status;
  if (body === undefined) {
    res.end();
    return;
  }
  const json = JSON.stringify(body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(json);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function validateBoard(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("body must be a JSON object");
  }
  if (!Array.isArray(payload.columns)) throw new Error("missing key: columns");
  if (!Array.isArray(payload.cards)) throw new Error("missing key: cards");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    send(res, 204);
    return;
  }

  try {
    if (req.method === "GET") {
      if (!kvConfigured()) {
        send(res, 204);
        return;
      }
      const raw = await kvCommand(["GET", KEY]);
      if (raw == null || raw === "") {
        send(res, 204);
        return;
      }
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      send(res, 200, data);
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      if (!kvConfigured()) {
        send(res, 501, { error: "Shared storage not configured" });
        return;
      }
      const payload = await readBody(req);
      validateBoard(payload);
      payload.updated = todayBogota();
      await kvCommand(["SET", KEY, JSON.stringify(payload)]);
      send(res, 200, payload);
      return;
    }

    send(res, 405, { error: "method not allowed" });
  } catch (err) {
    send(res, 400, { error: String(err.message || err) });
  }
};
