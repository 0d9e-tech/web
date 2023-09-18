import unidecode from "npm:unidecode";

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
      allowed_updates: ["message", "callback_query", "inline_query"],
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
  if (DOMAIN?.includes("ngrok")) console.log(data);
  if ("callback_query" in data) return await handleCallbackQuery(data);
  if ("inline_query" in data) return await handleInlineQuery(data);

  const text = data?.message?.text ?? data?.message?.caption;
  if (typeof text !== "string") {
    console.log("no text", data);
    return;
  }

  if (text.toLowerCase().includes("haha sex")) {
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
  }

  if (text.startsWith("/sh ") && data.message.chat.id === MAIN_CHAT_ID) {
    handleSh(data, text.slice(4));
  }

  if (text.includes("@yall") && data.message.chat.id === MAIN_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        parse_mode: "MarkdownV2",
        text: await Deno.readTextFile("./static/persistent/yall.txt"),
      }),
    });
  }

  if (/(?<!GNU[+/ -])Linux/i.exec(text) !== null) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        text: `I'd just like to interject for a moment. What you're refering to as Linux, is in fact, GNU/Linux, or as I've recently taken to calling it, GNU plus Linux. Linux is not an operating system unto itself, but rather another free component of a fully functioning GNU system made useful by the GNU corelibs, shell utilities and vital system components comprising a full OS as defined by POSIX.

Many computer users run a modified version of the GNU system every day, without realizing it. Through a peculiar turn of events, the version of GNU which is widely used today is often called Linux, and many of its users are not aware that it is basically the GNU system, developed by the GNU Project.

There really is a Linux, and these people are using it, but it is just a part of the system they use. Linux is the kernel: the program in the system that allocates the machine's resources to the other programs that you run. The kernel is an essential part of an operating system, but useless by itself; it can only function in the context of a complete operating system. Linux is normally used in combination with the GNU operating system: the whole system is basically GNU with Linux added, or GNU/Linux. All the so-called Linux distributions are really distributions of GNU/Linux!`,
      }),
    });
  }

  if (text === "/inspect") {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        parse_mode: "MarkdownV2",
        text: `\`\`\`\n${JSON.stringify(
          data.message.reply_to_message,
          null,
          2
        )}\n\`\`\``,
      }),
    });
  }

  if (text.startsWith("/settype ") && data.message.chat.id === MAIN_CHAT_ID) {
    const [id, type] = text.slice(9).split(" ");
    if (contentTypes.has(id)) {
      contentTypes.set(id, type);
    }
  }

  if (text.startsWith("/logo ") && data.message.chat.id === MAIN_CHAT_ID) {
    await handleLogo(data, text.slice(6));
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

const LOGO_TEMPLATE = await Deno.readTextFile("./static/logo.svg");
const LOGO_RENDER_SIZE = 500;

async function generateLogos(text: string, filename: string) {
  const texted = LOGO_TEMPLATE.replace("TEMPLATETEXT", text.trim());
  await Deno.writeTextFile(`./static/persistent/logos/${filename}.svg`, texted);
  return (
    await Deno.run({
      cmd: [
        "inkscape",
        `./static/persistent/logos/${filename}.svg`,
        "-o",
        `./static/persistent/logos/${filename}.png`,
        "-w",
        LOGO_RENDER_SIZE.toString(),
      ],
      stderr: "null",
    }).status()
  ).code;
}

function slugify(text: string) {
  return (unidecode(text.trim()) as string)
    .replaceAll(" ", "-")
    .replaceAll(/[^a-z0-9_-]/gi, (x) => "0x" + x.charCodeAt(0).toString(16));
}

async function handleLogo(data: any, text: string) {
  const fn = `${slugify(text)}_${new Date().toISOString()}`;
  if ((await generateLogos(text, fn)) === 0)
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        photo: `https://${DOMAIN}/persistent/logos/${fn}.png`,
        caption: `https://${DOMAIN}/persistent/logos/${fn}.svg`,
      }),
    });
}

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
    text = "```\n" + res + "```";
    if (exitCode !== 0)
      text = `[Exit code ${exitCode}](https://${DOMAIN}/tgweb/${id})\n` + text;
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
  if (cbData.startsWith("kill:")) {
    const proc = runningProcesses.get(cbData.slice(5));
    if (proc === undefined) return;
    const killProc = Deno.run({
      cmd: ["rkill", "-9", proc.pid.toString()],
    });
    await killProc.status();
    return;
  }
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

let imageI = 0;
async function handleInlineQuery(data: any) {
  const { id: inline_query_id, query, from } = data.inline_query;
  console.log(
    `Logo from ${from.first_name} ${from.last_name} (@${from.username}): ${query}`
  );
  const fn = `inline_${imageI++}_${slugify(query)}_${new Date().toISOString()}`;
  if ((await generateLogos(query, fn)) === 0)
    await fetch(`https://api.telegram.org/bot${token}/answerInlineQuery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inline_query_id,
        results: [
          {
            type: "photo",
            id: "0",
            photo_url: `https://${DOMAIN}/persistent/logos/${fn}.png`,
            thumb_url: `https://${DOMAIN}/persistent/logos/${fn}.png`,
            photo_width: LOGO_RENDER_SIZE.toString(),
            photo_height: LOGO_RENDER_SIZE.toString(),
            title: "Sus?",
            caption: `https://${DOMAIN}/persistent/logos/${fn}.svg`,
          },
        ],
      }),
    });
}
