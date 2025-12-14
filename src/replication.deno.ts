// deno-lint-ignore-file no-explicit-any
// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import { handleTgUpdate } from "./tg/bot.deno.ts";
import { DOMAIN, genRandomToken, tgCall } from "./tg/utils.deno.ts";
import { RequestEvent } from "./utils.deno.ts";

const currentPeers = new Map<string, { myToken: string; theirToken: string }>(
  (Deno.env.get("REPLICATION_ENDPOINTS")?.split(",") || []).map((peer) => [
    peer.trim(),
    { myToken: genRandomToken(16), theirToken: genRandomToken(16) },
  ]),
);

function listPeers() {
  console.log("Current replication peers:");
  for (const [endpoint, tokens] of currentPeers.entries()) {
    console.log(
      `- ${endpoint}: myToken=${
        tokens.myToken.slice(
          0,
          4,
        )
      }..., theirToken=${tokens.theirToken.slice(0, 4)}...`,
    );
  }
}

export async function handleReplication(
  e: RequestEvent,
): Promise<Response | null> {
  const url = new URL(e.request.url);

  if (url.pathname === "/replication/event") {
    if (e.request.method.toUpperCase() !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const body = await e.request.json();
    const { data, depth, token, src } = body;
    if (!token || currentPeers.get(src)?.theirToken !== token) {
      console.log(
        `Unauthorized replication attempt from ${src} (${
          token.slice(0, 4)
        }...)`,
      );
      return new Response("Unauthorized", { status: 401 });
    }
    await Promise.all([
      e.respondWith(
        new Response("processing", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
          },
        }),
      ),
      processTgUpdate(data, depth),
    ]);
    return null;
  }

  if (url.pathname === "/replication/register") {
    const data = await e.request.json();
    const { myToken, yourToken, src, confirmOnly } = data;
    console.log(
      `Received replication registration${
        confirmOnly ? " (confirm-only)" : ""
      } request from ${data.src}`,
    );
    if (
      typeof myToken !== "string" ||
      typeof yourToken !== "string" ||
      typeof src !== "string" ||
      !myToken ||
      !yourToken ||
      !src
    ) {
      return new Response("Bad Request", { status: 400 });
    }
    const peerData = currentPeers.get(src);
    if (!peerData) {
      return new Response("You are not my friend", { status: 403 });
    }
    if (peerData.myToken === yourToken && peerData.theirToken === myToken) {
      return new Response("ok", { status: 200 });
    }

    if (confirmOnly) {
      return new Response("I did not ask for this", { status: 409 });
    }

    const resp = await fetch(`https://${src}/replication/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        myToken: yourToken,
        yourToken: myToken,
        src: DOMAIN,
        confirmOnly: true,
      }),
    });
    if (!resp.ok) {
      console.log(
        `Peer ${src} requested registration, but didn't confirm:`,
        await resp.text(),
      );
      return new Response("You seem kinda sus", { status: 403 });
    }

    peerData.myToken = yourToken;
    peerData.theirToken = myToken;
    console.log(`Peer ${src} has updated their registration.`);
    listPeers();
    return new Response("oh hi", { status: 200 });
  }

  return new Response("Not Found", { status: 404 });
}

export async function replicateData(data: any, depth: number) {
  for (const [endpoint, peerData] of currentPeers.entries()) {
    if (!peerData.myToken) continue;
    try {
      const resp = await fetch(`https://${endpoint}/replication/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data,
          depth,
          token: peerData.myToken,
          src: DOMAIN,
        }),
      });
      if (resp.status === 401) {
        peerData.myToken = genRandomToken(16);
        peerData.theirToken = endpoint === DOMAIN
          ? peerData.myToken
          : genRandomToken(16);
        console.log(
          `Peer ${endpoint} rejected replication (401). Re-registering...`,
        );
        const regResp = await fetch(
          `https://${endpoint}/replication/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              myToken: peerData.myToken,
              yourToken: peerData.theirToken,
              src: DOMAIN,
            }),
          },
        );
        if (!regResp.ok) {
          throw new Error(
            `Re-registration to ${endpoint} failed: ${await regResp.text()}`,
          );
        }
        console.log(`Re-registration to ${endpoint} successful.`);
        listPeers();
        // Retry replication once after re-registering
        const retryResp = await fetch(`https://${endpoint}/replication/event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data,
            depth,
            token: peerData.myToken,
            src: DOMAIN,
          }),
        });
        if (!retryResp.ok) {
          console.error(
            `Replication to ${endpoint} after re-registration failed:`,
            await retryResp.text(),
          );
        }
      } else if (!resp.ok) {
        console.error(`Replication to ${endpoint} failed:`, await resp.text());
      }
    } catch (e) {
      console.error(`Replication to ${endpoint} failed:`, e);
    }
  }
}

export async function processTgUpdate(data: any, depth: number) {
  for await (const dato of handleTgUpdate(data)) {
    if (depth >= 5) {
      tgCall({ text: "🔥" });
      continue;
    }

    await replicateData(dato, depth + 1);
  }
}
