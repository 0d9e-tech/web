const token = Deno.env.get("TG_BOT_TOKEN");
if (!token) {
  throw new Error("TG_BOT_TOKEN is not set");
}

const manPages = await fetch(
  "https://www.man7.org/linux/man-pages/dir_all_by_section.html"
)
  .then((r) => r.text())
  .then((t) =>
    t
      .split("\n")
      .filter((x) => x.startsWith('<a href="./man'))
      .map((x) => x.split('"')[1].slice(2))
  );

export const webhookPath = "/tg-webhook";

const randomToken = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(96)))
)
  .replaceAll("/", "_")
  .replaceAll("+", "-")
  .replaceAll("=", "");

const DOMAIN = "93f4-78-128-191-42.ngrok-free.app";

await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: `https://${DOMAIN}${webhookPath}`,
    secret_token: randomToken,
    allowed_updates: ["message"],
  }),
});

await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    chat_id: -1001639155811,
    text: `Bot started, index of ${manPages.length} man pages loaded`,
  }),
});

export async function handleRequest(e: Deno.RequestEvent) {
  if (
    e.request.method.toUpperCase() !== "POST" ||
    e.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== randomToken
  ) {
    await e.respondWith(
      new Response("You shall not pass", {
        status: 401,
        headers: {
          "Content-Type": "text/plain",
        },
      })
    );
    return;
  }

  const data = await e.request.json();

  await e.respondWith(
    new Response("processing", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    })
  );

  const text = data?.message?.text;
  if (typeof text !== "string") {
    console.log("no text", data);
    return;
  }

  if (text.toLowerCase().includes("haha sex")) {
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        protect_content: true,
        photo:
          "AgACAgQAAxkBAAMDZH5DU3pz0Hq3pANQf1IIdUTGScsAAmu7MRvY1khTtdfPHQH6mQIBAAMCAAN5AAMvBA",
      }),
    });
    return;
  }

  const manMatch = text.match(/^\s*man\s*([1-8])?\s*([a-z-_+.]+)\s*$/i);
  if (manMatch !== null) {
    const key =
      (manMatch[1] === undefined ? "" : "man" + manMatch[1]) +
      "/" +
      manMatch[2] +
      ".";
    const matches = manPages
      .filter((x) => x.includes(key))
      .map((x) => `https://www.man7.org/linux/man-pages/${x}`);
    const text =
      matches.length === 0 ? "No man pages found" : matches.join("\n");
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        text,
      }),
    });
    return;
  }
}
