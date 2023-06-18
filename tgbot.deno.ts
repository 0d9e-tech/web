const token = Deno.env.get("TG_BOT_TOKEN");
const MAIN_CHAT_ID = parseInt(Deno.env.get("TG_MAIN_CHAT_ID")!);
const DOMAIN = Deno.env.get("DOMAIN");
export const webhookPath = "/tg-webhook";

function genRandomToken(bytes: number) {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))
  )
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

const webhookUrlToken = genRandomToken(96);

let manPages: string[];
let tempDir = "";
const contentTypes = new Map<string, string>();
const runningProcesses = new Map<string, Deno.Process>();

export async function init() {
  if (!token || !DOMAIN || isNaN(MAIN_CHAT_ID)) {
    throw new Error("TG_BOT_TOKEN, TG_MAIN_CHAT_ID or DOMAIN is not set");
  }

  tempDir = await Deno.makeTempDir();
  console.log("Using temp dir", tempDir);

  manPages = await fetch(
    "https://www.man7.org/linux/man-pages/dir_all_by_section.html"
  )
    .then((r) => r.text())
    .then((t) =>
      t
        .split("\n")
        .filter((x) => x.startsWith('<a href="./man'))
        .map((x) => x.split('"')[1].slice(2))
    );

  await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `https://${DOMAIN}${webhookPath}`,
      secret_token: webhookUrlToken,
      allowed_updates: ["message", "callback_query"],
    }),
  });

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: MAIN_CHAT_ID,
      text: `Bot started, index of ${manPages.length} man pages loaded`,
    }),
  });
}

export async function handleRequest(e: Deno.RequestEvent) {
  if (
    e.request.method.toUpperCase() !== "POST" ||
    e.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookUrlToken
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

  await Promise.all([
    e.respondWith(
      new Response("processing", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
        },
      })
    ),
    processTgUpdate(data),
  ]);
}

async function processTgUpdate(data: any) {
  if ("callback_query" in data) {
    return await handleCallbackQuery(data);
  }

  const text = data?.message?.text;
  if (typeof text !== "string") {
    console.log("no text", data);
    return;
  }

  if (text.toLowerCase().includes("haha sex")) {
    if (data.message.from.id === 656461353) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: data.message.chat.id,
          reply_to_message_id: data.message.message_id,
          text: "No sex :(",
        }),
      });
    } else {
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
    }
  }

  if (text.startsWith("/sh ") && data.message.chat.id === MAIN_CHAT_ID) {
    handleSh(data, text.slice(4));
  }

  if (text.startsWith("/settype ") && data.message.chat.id === MAIN_CHAT_ID) {
    const [id, type] = text.slice(9).split(" ");
    if (contentTypes.has(id)) {
      contentTypes.set(id, type);
    }
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
  }

  if (
    text.toLowerCase().includes("rust") ||
    text.toLowerCase().includes("růst")
  ) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        text: Math.random() > 0.5 ? "⚡" : "🦀",
      }),
    });
  }

  if (text.toLowerCase().includes("sus")) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        text: "ඞ",
      }),
    });
  }
}

const decoder = new TextDecoder("utf8");

async function handleSh(data: any, cmd: string) {
  const id = genRandomToken(32);
  await Deno.writeFile(`${tempDir}/${id}.sh`, new TextEncoder().encode(cmd), {
    createNew: true,
  });

  const outFile = await Deno.open(`${tempDir}/${id}.out`, {
    write: true,
    createNew: true,
  });
  const proc = Deno.run({
    cmd: ["bash", `${tempDir}/${id}.sh`],
    stdout: outFile.rid,
    stderr: outFile.rid,
  });
  const raceResult = await Promise.race([
    proc.status(),
    new Promise<void>((resolve) => setTimeout(() => resolve(), 5000)),
  ]);

  if (raceResult !== undefined) {
    await reportProcessResult(
      outFile,
      id,
      data.message.message_id,
      raceResult.code
    );
    return;
  }

  runningProcesses.set(id, proc);
  contentTypes.set(id, "application/octet-stream");

  const progressMessageResponse = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: MAIN_CHAT_ID,
        reply_to_message_id: data.message.message_id,
        parse_mode: "MarkdownV2",
        text: `[Command is taking too long](https://${DOMAIN}/tgweb/${id})\\. Set Content\\-Type with \`/settype ${id} text/plain\``,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Kill process",
                callback_data: `kill:${id}`,
              },
            ],
          ],
        },
      }),
    }
  ).then((x) => x.json());
  console.log(progressMessageResponse);

  const status = await proc.status();
  runningProcesses.delete(id);

  await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: MAIN_CHAT_ID,
      message_id: progressMessageResponse.result.message_id,
      reply_markup: {
        inline_keyboard: [],
      },
    }),
  });
  await reportProcessResult(
    outFile,
    id,
    progressMessageResponse.result.message_id,
    status.code
  );
}

async function reportProcessResult(
  outFile: Deno.FsFile,
  id: string,
  reply_to_message_id: number,
  exitCode: number
) {
  const outPath = `${tempDir}/${id}.out`;
  const stat = await outFile.stat();
  outFile.close();
  const fileProc = Deno.run({
    cmd: ["file", "-ib", outPath],
    stdout: "piped",
  });
  // need to await the status to not create zombie processes
  await fileProc.status();
  const mime = decoder.decode(await fileProc.output());
  contentTypes.set(id, mime);
  const isText =
    mime.startsWith("text/") || mime.startsWith("application/json");
  let text;
  if (stat.size === 0) text = `No output \\(exit code ${exitCode}\\)\\.`;
  else if (isText && stat.size <= 5000) {
    let res = decoder
      .decode(await Deno.readFile(outPath))
      .replaceAll("\\", "\\\\")
      .replaceAll("`", "\\`");
    if (res.at(-1) !== "\n") res += "\n";
    text =
      `[Exit code ${exitCode}](https://${DOMAIN}/tgweb/${id})\n` +
      "```\n" +
      res +
      "```\n" +
      `Set Content\\-Type with \`/settype ${id} mime/type\``;
  } else
    text =
      "[" +
      (isText ? "Output too long" : "Binary output") +
      `](https://${DOMAIN}/tgweb/${id}) \\(exit code ${exitCode}, ${stat.size} bytes\\)\\. Set Content\\-Type with \`/settype ${id} mime/type\``;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: MAIN_CHAT_ID,
      reply_to_message_id,
      parse_mode: "MarkdownV2",
      text,
    }),
  });
}

async function handleCallbackQuery(data: any) {
  const cbData = data.callback_query.data;
  if (cbData.startsWith("kill:"))
    runningProcesses.get(cbData.slice(5))?.kill("SIGKILL");
}

export async function handleTgWeb(
  e: Deno.RequestEvent
): Promise<Response | null> {
  const url = new URL(e.request.url);
  const path = url.pathname.slice(7);
  const ct = contentTypes.get(path);
  if (ct === undefined)
    return new Response("Not found", {
      headers: { "Content-Type": "text/plain" },
      status: 404,
    });

  const file = await Deno.open(`${tempDir}/${path}.out`);
  return new Response(file.readable, {
    headers: { "Content-Type": ct },
  });
}
