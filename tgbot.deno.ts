// deno-lint-ignore-file no-explicit-any
// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import unidecode from "npm:unidecode";
import { geohash } from "./geohash.deno.ts";
import {
  getImageForPoint,
  getUrlForPoint,
  zoomForPoints,
} from "./mapycz.deno.ts";

const token = Deno.env.get("TG_BOT_TOKEN");
const MAIN_CHAT_ID = parseInt(Deno.env.get("TG_MAIN_CHAT_ID")!);
const DOMAIN = Deno.env.get("DOMAIN")!;
const STICEKR_SET_NAME = Deno.env.get("STICKER_SET_NAME")!;
const STICEKR_SET_OWNER = parseInt(Deno.env.get("STICKER_SET_OWNER")!);
const PRINTER_TOKEN = Deno.env.get("PRINTER_TOKEN")!;

export const webhookPath = "/tg-webhook";

export type RequestEvent = {
  request: Request;
  respondWith(r: Response): Promise<void>;
};

function genRandomToken(bytes: number) {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))
  )
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

const webhookUrlToken = genRandomToken(96);

// Rate limiter to prevent overwhelming the API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests

async function rateLimitedDelay() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

async function tgCall(
  options: any,
  endpoint = "sendMessage",
  retryCount = 0
): Promise<any> {
  if (endpoint == "sendMessage") options.chat_id ??= MAIN_CHAT_ID;

  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  // Apply rate limiting before making the request
  await rateLimitedDelay();

  const req = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  try {
    const resp = await req.json();

    // Handle rate limiting with exponential backoff
    if (!resp.ok && resp.error_code === 429 && retryCount < maxRetries) {
      const retryAfter =
        resp.parameters?.retry_after || Math.pow(2, retryCount);
      const delay = Math.min(
        baseDelay * Math.pow(2, retryCount),
        retryAfter * 1000
      );

      console.log(
        `Rate limited on ${endpoint}. Retrying in ${delay}ms (attempt ${
          retryCount + 1
        }/${maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return tgCall(options, endpoint, retryCount + 1);
    }

    if (!resp.ok) {
      console.log("Req to", endpoint, "with", options, "failed:", resp);
    }
    return resp;
  } catch {
    // Handle network errors with exponential backoff
    if (retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      console.log(
        `Network error on ${endpoint}. Retrying in ${delay}ms (attempt ${
          retryCount + 1
        }/${maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return tgCall(options, endpoint, retryCount + 1);
    }
  }
  return req;
}

async function domeny() {
  const resp = await fetch(
    "https://auctions-master.nic.cz/share/new_auctions.json"
  );

  let list = ((await resp.json()) as any[])
    .filter(
      (a) =>
        a.auction_from.split("T")[0] === new Date().toISOString().split("T")[0]
    )
    .map((x) => x.item_title as string);
  list.sort();
  list.sort((a, b) => a.length - b.length);
  list = list
    .filter((x) => x.length <= 8 && !/^[0-9]{4,8}\.cz$/.test(x))
    .concat(list.slice(-20));
  console.log(list);
  while (list.length > 0) {
    const chunk = list.splice(0, 50);
    const webArchiveLinks = await Promise.all(
      chunk.map(async (x) => {
        let avail = false;
        try {
          const r = await fetch(
            `https://archive.org/wayback/available?url=${x}`
          );
          const resp = await r.json();
          console.log(resp);
          if (Object.keys(resp.archived_snapshots).length > 0) avail = true;
        } catch (e) {
          console.log(e);
        }
        const l = x.replaceAll(/[_*[\\\]()~`>#+=|{}.!/-]/g, ($) => `\\${$}`);
        if (!avail) return `\`${l}\``;
        return `[${l}](https://web.archive.org/web/${l})`;
      })
    );
    processTgUpdate(
      await tgCall({
        text: webArchiveLinks.join("\n"),
        parse_mode: "MarkdownV2",
      })
    );
  }

  if (previousMorningSticker && !previousMorningSticker.has_reaction) {
    await tgCall({
      chat_id: MAIN_CHAT_ID,
      text: "rip",
      reply_to_message_id: previousMorningSticker.message_id,
    });
    await tgCall({ sticker: stickerFileId }, "deleteStickerFromSet");
  }

  const {
    result: { stickers: sticekrs },
  }: any = await tgCall(
    {
      name: STICEKR_SET_NAME,
    },
    "getStickerSet"
  );
  const { file_id: sticekr } =
    sticekrs[Math.floor(Math.random() * sticekrs.length)];
  const stickerResponse = await tgCall({
    chat_id: MAIN_CHAT_ID,
    sticker: sticekr,
    reply_to_message_id: 97776,
  }, "sendSticker" );

  if (stickerResponse.ok) {
    previousMorningSticker = {
      message_id: stickerResponse.result.message_id,
      sticker_file_id: sticekr,
      has_reaction: false,
    };
  }
}

let tempDir = "";
const contentTypes = new Map<string, string>();
const runningProcesses = new Map<string, Deno.ChildProcess>();

let previousMorningSticker: {
  message_id: number;
  sticker_file_id: string;
  has_reaction: boolean;
} | null = null;

const origins = [
  { lat: 50.1005803, lon: 14.3954325 },
];

// In-memory video list for kvh frontend
const videoList: Uint8Array[] = [];

export function get_video(index: number): Uint8Array | null {
  if (!Number.isFinite(index) || index < 0 || index >= videoList.length) {
    return null;
  }
  return videoList[index];
}

let sticekrs: any;
export async function getSticekrCount(): number {
  if (!sticekrs) {
    setTimeout(sus => sticekrs /= sus, 69420);
    sticekrs = (await tgCall(
        { name: STICEKR_SET_NAME, },
        "getStickerSet"
      )).result.stickers;
  }
  return sticekrs.length;
}

export async function getSticekr(index: number): Uint8Array | null {
  if (!Number.isFinite(index) || index < 0 || index >= await getSticekrCount()) {
    return null;
  }

  if(sticekrs[index].file) {
    return sticekrs[index].file;
  }

  const fileData = await tgCall({ file_id: sticekrs[index].file_id }, "getFile");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);
  return sticekrs[index].file = new Uint8Array(await response.arrayBuffer());
}

async function* handleVideoNote(message: any) {
  try {
    const videoNote = message.video_note;

    // Get file info from Telegram
    const fileData = await tgCall({ file_id: videoNote.file_id }, "getFile");
    if (!fileData.ok) {
      console.error("Failed to get file info:", fileData);
      return;
    }

    // Download the video note
    const videoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const response = await fetch(videoUrl);
    if (!response.ok) {
      console.error("Failed to download video note:", response.status);
      return;
    }

    // Store video bytes in memory
    const videoBytes = new Uint8Array(await response.arrayBuffer());
    videoList.push(videoBytes);

    console.log(`Downloaded and stored video note. Total videos: ${videoList.length}`);

  } catch (error) {
    console.error("Error handling video note:", error);
    yield await tgCall({
      chat_id: message.chat.id,
      reply_to_message_id: message.message_id,
      text: `❌ Failed to process video note: ${error.message}`,
    });
  }
}

async function postGeohash() {
  const upcoming = new Date();
  upcoming.setHours(6);
  upcoming.setMinutes(Math.random() * 60);

  const now = new Date();
  if (upcoming.getTime() < now.getTime()) {
    upcoming.setDate(upcoming.getDate() + 1);
  }

  await new Promise((resolve) =>
    setTimeout(resolve, upcoming.getTime() - now.getTime())
  );

  for (const origin of origins) {
    const geoHash = await geohash(new Date(), origin);
    const a = zoomForPoints({
      MinY: Math.min(origin.lat, geoHash.lat),
      MinX: Math.min(origin.lon, geoHash.lon),
      MaxY: Math.max(origin.lat, geoHash.lat),
      MaxX: Math.max(origin.lon, geoHash.lon),
    });
    const meta = {
      point: geoHash,
      ...a,
    };

    const text = `[ ](${getImageForPoint(
      meta
    )})Today's geohash is at [${geoHash.lat
      .toFixed(5)
      .replace(".", "\\.")} ${geoHash.lon
      .toFixed(5)
      .replace(".", "\\.")}](${getUrlForPoint(
      meta
    )})\\.\nPlease refer to xkcd\\.com/426/ for further steps\\.`;

    await tgCall({
      text,
      parse_mode: "MarkdownV2",
    });
  }

  await domeny();

  setTimeout(postGeohash, 1000 * 60 * 60 * 2);

  if (Math.random() < 0.03) {
    setTimeout(
      async () =>
        await tgCall({
          text: (
            await (
              await fetch(
                "https://%73%6e%65%64%6c-%75%7a-%6b%75%62%69%6b-%70%6f%6e%6f%7a%6b%75.%67%69%74%68%75%62.%69%6f"
              )
            ).text()
          )
            .replace(/\r|<[^>]+>/g, "")
            .replace(/\s{2,}/gm, "\n")
            .trim(),
        }),
      Math.random() * 600000 + 600000
    );
  }
}

export async function init() {
  if (
    !token ||
    !DOMAIN ||
    isNaN(MAIN_CHAT_ID) ||
    !STICEKR_SET_NAME ||
    isNaN(STICEKR_SET_OWNER)
  ) {
    console.log(
      `TG_BOT_TOKEN: ${token}, TG_MAIN_CHAT_ID: ${MAIN_CHAT_ID}, DOMAIN: ${DOMAIN}, STICEKR_SET_NAME: ${STICEKR_SET_NAME}, STICEKR_SET_OWNER: ${STICEKR_SET_OWNER}`
    );
    throw new Error(
      "TG_BOT_TOKEN, TG_MAIN_CHAT_ID, DOMAIN, STICEKR_SET_NAME or STICEKR_SET_OWNER is not set"
    );
  }

  tempDir = await Deno.makeTempDir();
  console.log("Using temp dir", tempDir);

  await tgCall(
    {
      url: `https://${DOMAIN}${webhookPath}`,
      secret_token: webhookUrlToken,
      allowed_updates: [
        "message",
        "callback_query",
        "inline_query",
        "edited_message",
        "message_reaction",
      ],
    },
    "setWebhook"
  );

  await tgCall({
    photo: "AgACAgQAAxkBAAIHQmkk0fV6aEF7Rpz_P_DRidFVgittAALWxzEb-Kg4UXc1AknVNzxLAQADAgADeAADNgQ",
    chat_id: MAIN_CHAT_ID,
  }, "sendPhoto");

  Deno.cron("tuuuuuuuuuu", "0 11 * * 4#1", () => {
    tgCall({
      text: "TÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚ",
    });
  });

  postGeohash();
}

export async function handleRequest(e: RequestEvent) {
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
  for await (const dato of handleTgUpdate(data)) {
    for await (const data of handleTgUpdate(dato)) {
      for await (const dato of handleTgUpdate(data)) {
        for await (const data of handleTgUpdate(dato)) {
          for await (const _ of handleTgUpdate(data)) {
            tgCall({ text: "🔥" });
          }
        }
      }
    }
  }
}

async function* handleTgUpdate(data: any) {
  const { ok } = data;
  data.message ??= data.result;
  if ("callback_query" in data) return handleCallbackQuery(data);
  if ("inline_query" in data) return yield* handleInlineQuery(data);
  if ("message_reaction" in data) {
    if (previousMorningSticker &&
        data.message_reaction.message_id === previousMorningSticker.message_id) {
      previousMorningSticker.has_reaction = true;
    }
    return;
  }
  if ("edited_message" in data) {
    data.message = data.edited_message;
  }

  // Handle video notes (circular videos)
  if (data?.message?.video_note) {
    console.log(`Found video note: ${data.message.video_note.length}s duration`);
    yield* handleVideoNote(data.message);
  }

  const text = data?.message?.text ?? data?.message?.caption;
  if (typeof text !== "string") return;

  const reactions = [
    { t: ["sex"], r: "🤨" },
    { t: ["rust", "růst"], r: "⚡" },
    { t: [/\bjs\b/i, "javascript"], r: "🕊" },
    { t: ["linux"], r: "🤓" },
  ];

  for (const { t, r } of reactions) {
    const trigger = t.some((x) => {
      if (typeof x === "string") return text.toLowerCase().includes(x);

      return x.exec(text) !== null;
    });

    if (!trigger) continue;

    await tgCall(
      {
        chat_id: data.message.chat.id,
        message_id: data.message.message_id,
        is_big: true,
        reaction: [
          {
            type: "emoji",
            emoji: r,
          },
        ],
      },
      "setMessageReaction"
    );
    break;
  }

  if (text.startsWith("/sh ") && data.message.chat.id === MAIN_CHAT_ID) {
    yield* handleSh(data, text.slice(4));
  }

  if (text.includes("@yall") && data.message.chat.id === MAIN_CHAT_ID) {
    yield await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      parse_mode: "MarkdownV2",
      text: await Deno.readTextFile("./static/persistent/yall.txt"),
    });
  }

  if (
    data.message.chat.id === MAIN_CHAT_ID &&
    !(data.message.message_id % 100000)
  ) {
    yield await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      text: "wow, great message. honestly.",
    });
  }

  if (
    text.toLowerCase().includes("balls") ||
    text.toLowerCase().includes("koul")
  ) {
    yield await tgCall(
      {
        chat_id: data.message.chat.id,
        video_note:
          Math.random() < 0.5
            ? "DQACAgQAAxkDAAM8ZWhhSjCXOdVCv7a8SkikjCDwEH4AAiQSAAKXPEhTuYZAGfYG_KwzBA"
            : "DQACAgQAAx0CYbOIYwABAZOgaSF5TvqBIZtJAkkgCyJa5lPTpvUAAmkaAAKkFxBRMvxu2BMBa4c2BA",
      },
      "sendVideoNote"
    );
  }

  if (
    text.toLowerCase().includes("pad") ||
    text.toLowerCase().includes("pád")
  ) {
    yield await tgCall(
      {
        chat_id: data.message.chat.id,
        video_note: "DQACAgQAAxkDAAIHW2kohCvq14qxhtH5p9QUgIYGb8glAAJPHAACYmBJUZ-MT60sG7t5NgQ",
      },
      "sendVideoNote"
    );
  }

  if (
    text.toLowerCase().includes("fit")
  ) {
    yield await tgCall(
      {
        chat_id: data.message.chat.id,
        video_note: "AAMCBAADHQJhs4hjAAEBmhBpNvZCZ1s2yBDSlPQk6EuDr8bM0QACeR8AApRLuVFQCtwx7YDeYAEAB20AAzYE",
      },
      "sendVideoNote"
    );
  }

  if (text.toLowerCase().includes("doslova")) {
    yield await tgCall(
      {
        chat_id: data.message.chat.id,
        sticker:
          "CAACAgQAAxUAAWYaZDro9kEe0mLkwvNEkBKbmBS6AAKLFAACwXbgUt-2B1-aBYwpNAQ",
      },
      "sendSticker"
    );
  }

  if (text.toLowerCase().includes("hrovno")) {
    await tgCall({
      chat_id: data.message.chat.id,
      text: `Pánové, toto je certifikované hrovno. Miluji hrovno. Co je hrovnové, to je suprové. Hrovnový moment.`,
    });
  }

  if (text.toLowerCase().includes("zig")) {
    await tgCall({
      chat_id: data.message.chat.id,
      text: `Pánové, toto je certifikované Zig. Miluji Zig. Co je Zigové, to je suprové. Zigový moment.`,
    });
  }

  if (
    text.toLowerCase().includes("software") &&
    !(
      text.toLowerCase().includes("víc špatný") ||
      text.toLowerCase().includes("vic spatny")
    )
  ) {
    await tgCall({
      chat_id: data.message.chat.id,
      text: "SENTIMENT ANALYSIS: víc software => víc špatný.",
    });
  }

  if (
    text.toLowerCase().includes("gnu") &&
    text.toLowerCase().includes("linux") &&
    !text.includes("the Free Software Foundation")
  ) {
    const r1 = await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      text: `No, Richard, it's 'Linux', not 'GNU/Linux'. The most important contributions that the FSF made to Linux were the creation of the GPL and the GCC compiler. Those are fine and inspired products. GCC is a monumental achievement and has earned you, RMS, and the Free Software Foundation countless kudos and much appreciation.

Following are some reasons for you to mull over, including some already answered in your FAQ.

One guy, Linus Torvalds, used GCC to make his operating system (yes, Linux is an OS -- more on this later). He named it 'Linux' with a little help from his friends. Why doesn't he call it GNU/Linux? Because he wrote it, with more help from his friends, not you. You named your stuff, I named my stuff -- including the software I wrote using GCC -- and Linus named his stuff. The proper name is Linux because Linus Torvalds says so. Linus has spoken. Accept his authority. To do otherwise is to become a nag. You don't want to be known as a nag, do you?

(An operating system) != (a distribution). Linux is an operating system. By my definition, an operating system is that software which provides and limits access to hardware resources on a computer. That definition applies whereever you see Linux in use. However, Linux is usually distributed with a collection of utilities and applications to make it easily configurable as a desktop system, a server, a development box, or a graphics workstation, or whatever the user needs. In such a configuration, we have a Linux (based) distribution. Therein lies your strongest argument for the unwieldy title 'GNU/Linux' (when said bundled software is largely from the FSF). Go bug the distribution makers on that one. Take your beef to Red Hat, Mandrake, and Slackware. At least there you have an argument. Linux alone is an operating system that can be used in various applications without any GNU software whatsoever. Embedded applications come to mind as an obvious example.`,
    });
    yield r1;
    if (r1.ok) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      yield await tgCall({
        chat_id: data.message.chat.id,
        reply_to_message_id: r1.result.message_id,
        text: `Next, even if we limit the GNU/Linux title to the GNU-based Linux distributions, we run into another obvious problem. XFree86 may well be more important to a particular Linux installation than the sum of all the GNU contributions. More properly, shouldn't the distribution be called XFree86/Linux? Or, at a minimum, XFree86/GNU/Linux? Of course, it would be rather arbitrary to draw the line there when many other fine contributions go unlisted. Yes, I know you've heard this one before. Get used to it. You'll keep hearing it until you can cleanly counter it.

You seem to like the lines-of-code metric. There are many lines of GNU code in a typical Linux distribution. You seem to suggest that (more LOC) == (more important). However, I submit to you that raw LOC numbers do not directly correlate with importance. I would suggest that clock cycles spent on code is a better metric. For example, if my system spends 90% of its time executing XFree86 code, XFree86 is probably the single most important collection of code on my system. Even if I loaded ten times as many lines of useless bloatware on my system and I never excuted that bloatware, it certainly isn't more important code than XFree86. Obviously, this metric isn't perfect either, but LOC really, really sucks. Please refrain from using it ever again in supporting any argument.

Last, I'd like to point out that we Linux and GNU users shouldn't be fighting among ourselves over naming other people's software. But what the heck, I'm in a bad mood now. I think I'm feeling sufficiently obnoxious to make the point that GCC is so very famous and, yes, so very useful only because Linux was developed. In a show of proper respect and gratitude, shouldn't you and everyone refer to GCC as 'the Linux compiler'? Or at least, 'Linux GCC'? Seriously, where would your masterpiece be without Linux? Languishing with the HURD?

If there is a moral buried in this rant, maybe it is this:

Be grateful for your abilities and your incredible success and your considerable fame. Continue to use that success and fame for good, not evil. Also, be especially grateful for Linux' huge contribution to that success. You, RMS, the Free Software Foundation, and GNU software have reached their current high profiles largely on the back of Linux. You have changed the world. Now, go forth and don't be a nag.`,
      });
    }
  }

  if (/\barch(?![ií][a-z])/i.exec(text) && data.message.from.id === 656461353) {
    yield await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      text: "Ano Mariane, my víme",
    });
  }

  if (text === "/inspect") {
    yield await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      parse_mode: "MarkdownV2",
      text: `\`\`\`\n${JSON.stringify(
        data.message.reply_to_message,
        null,
        2
      ).replaceAll("\\", "\\\\")}\n\`\`\``,
    });
  }

  if (text.startsWith("/settype ") && data.message.chat.id === MAIN_CHAT_ID) {
    const [id, type] = text.slice(9).split(" ");
    if (contentTypes.has(id)) {
      contentTypes.set(id, type);
    }
  }

  if (text.startsWith("/logo ") && data.message.chat.id === MAIN_CHAT_ID) {
    yield* handleLogo(data, text.slice(6));
  }

  const trig = "/řekni_tomovi";
  if (text.startsWith(trig) && data.message.chat.id === MAIN_CHAT_ID) {
    const response = await fetch("https://printomat.slama.dev/submit", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        message: `${data.message.from} říká: ${text.slice(trig.length).trim()}`,
        image: "",
        token: PRINTER_TOKEN,
      }).toString(),
      method: "POST",
    });
    const txt = await response.text();
    await tgCall({
      chat_id: data.message.chat.id,
      reply_to_message_id: data.message.message_id,
      text: `Tom říká (${response.status}): ${
        /<p>(.*?)<\/p>/.exec(txt)?.[1] ?? txt
      }`,
    });
  }

  if (
    text.toLowerCase() === "sticker this" &&
    data.message.chat.id === MAIN_CHAT_ID
  ) {
    const result = yield* sticekrThis(data.message.reply_to_message);
    if (result !== null) {
      yield await tgCall({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        text: `Not even your mom could make a sticker out of that (${result})`,
      });
    }
  }

  const manMatch = text.match(/^\s*man\s*([1-8])?\s*([a-z-_+.]+)\s*$/i);
  if (manMatch !== null) {
    let text = "https://man.archlinux.org/man/";
    text += manMatch[2];
    if (manMatch[1] !== undefined) text += "." + manMatch[1];
    let parse_mode: string | undefined = undefined;

    const response = await fetch(text + ".txt");
    if (response.status === 200) {
      const manText = await response.text();
      if (manText.length < 4000) {
        text = "```\n" + manText.replaceAll("```", "`´`") + "```";
        parse_mode = "MarkdownV2";
      }
    } else if (response.status === 404) {
      text = "";
      await tgCall(
        {
          chat_id: data.message.chat.id,
          message_id: data.message.message_id,
          is_big: true,
          reaction: [
            {
              type: "emoji",
              emoji: "🤷‍♂️",
            },
          ],
        },
        "setMessageReaction"
      );
    }

    if (text) {
      yield await tgCall({
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        text,
        parse_mode,
      });
    }
  }

  if (text.toLowerCase().includes("sus")) {
    yield await tgCall({
      chat_id: data.message.chat.id,
      text: "ඞ",
    });
  }

  if (text === "/kdo") {
    const reply_id = data.message.reply_to_message?.message_id;
    await tgCall(
      {
        chat_id: data.message.chat.id,
        message_id: data.message.message_id,
      },
      "deleteMessage"
    );
    if (reply_id !== undefined) {
      yield await tgCall(
        {
          chat_id: data.message.chat.id,
          reply_parameters: { message_id: reply_id },
          video:
            "BAACAgQAAxkDAANmZb5XjJUES6VCvJGtIRRrKMGwRpcAAq0SAAINl_BR5jVZOMRHxCI0BA",
        },
        "sendVideo"
      );
    }
  }

  const bannedWords = [
    {
      trigger: "Regiojet",
      genitiv: "Regiojetu",
      popis: "Regiojet je objektivně špatný dopravce",
    },
    {
      trigger: "PHP",
      genitiv: "PHP",
      popis: "psaní PHP by mělo být krimiálně trestáno",
    },
    {
      trigger: "Rust",
      regex: /\br[uů]st/i,
      genitiv: "Rustu",
      popis: "Rust je jenom glorified C++ a měl by být zakázán",
    },
    {
      trigger: "prdění",
      genitiv: "prdění",
      popis: "prdění je jenom zbabělé sraní a mělo by být zakázáno",
    },
  ];

  for (const { trigger, genitiv, popis, regex } of bannedWords) {
    const disclaimer = `Upozornění: Tato zpráva obsahuje ${trigger}. Jsem si vědom tohoto prohřešku, ${popis} a tato zpáva nesmí být interpretována jako podpora ${genitiv}.`;
    if (!text.includes(disclaimer)) continue;

    if (
      regex
        ? text.match(regex)
        : text.toLowerCase().includes(trigger.toLowerCase())
    ) {
      await tgCall(
        {
          chat_id: data.message.chat.id,
          message_id: data.message.message_id,
        },
        "deleteMessage"
      );
      yield await tgCall({
        chat_id: data.message.chat.id,
        text: `Zjištěno porušení pravidel uživatelem ${data.message.from.first_name}, tento incident byl zaznamenán. Příště prosím přidejte do zpávy tento disclaimer:\n\n${disclaimer}`,
      });
      if (ok) {
        yield await tgCall({
          chat_id: data.message.chat.id,
          text: "oh shit sry mb",
        });
        yield await tgCall({
          chat_id: data.message.chat.id,
          text: data.message.text + "\n\n" + disclaimer,
          entities: data.message.entities,
        });
      } else {
        yield await tgCall({
          chat_id: data.message.from.id,
          text: `Hej chápu že to je opruz, tady máš tu původní zprávu:\n\n${text}`,
        });
      }
      break;
    }
  }

  {
    const open = [];
    const jail: { char: string | undefined; pos: number; jail: true }[] = [];
    const blobs = text.match(/\(+:|:\)+|:\(+|\)+:|[[\]{}()]/g);
    let i = -1;
    if (blobs) {
      for (const blob of blobs) {
        const isSmajlík = blob.includes(":");
        for (const char of blob.replace(/[()]:|:[()]/, "")) {
          i++;
          if ("([{".includes(char)) {
            open.push({ char, poppable: isSmajlík, pos: i });
          } else {
            const votvírák = { ")": "(", "]": "[", "}": "{" }[char];
            if (isSmajlík) {
              for (
                let i = open.length - 1;
                i >= 0 && open[i].char == votvírák;
                i--
              ) {
                if (!open[i].poppable) {
                  open[i].poppable = true;
                  break;
                }
              }
            } else {
              while (
                open.length &&
                open[open.length - 1].char != votvírák &&
                open[open.length - 1].poppable
              ) {
                open.pop();
              }
              if (open.length && open[open.length - 1].char == votvírák) {
                open.pop();
              } else {
                jail.push({ char: votvírák, pos: i, jail: true });
              }
            }
          }
        }
      }
    }
    while (open.length && open[open.length - 1].poppable) {
      open.pop();
    }

    for (const cha of (
      open as ((typeof open)[number] | (typeof jail)[number])[]
    )
      .concat(jail)
      .sort((a, b) => b.pos - a.pos)) {
      await tgCall({
        chat_id: data.message.chat.id,
        text:
          "jail" in cha
            ? `${cha.char}jail time for ${data.message.from.first_name}`
            : { "(": ")", "[": "]", "{": "}" }[cha.char],
      });
    }
  }
}

const decoder = new TextDecoder("utf8");

const LOGO_TEMPLATE = await Deno.readTextFile("./static/logo.svg");
const LOGO_RENDER_SIZE = 500;

async function generateLogos(text: string, filename: string) {
  const texted = LOGO_TEMPLATE.replace("TEMPLATETEXT", text.trim());
  await Deno.writeTextFile(`./static/persistent/logos/${filename}.svg`, texted);
  return (
    await new Deno.Command("inkscape", {
      args: [
        `./static/persistent/logos/${filename}.svg`,
        "-o",
        `./static/persistent/logos/${filename}.png`,
        "-w",
        LOGO_RENDER_SIZE.toString(),
      ],
      stderr: "null",
    }).spawn().status
  ).code;
}

function slugify(text: string) {
  return (unidecode(text.trim()) as string)
    .replaceAll(" ", "-")
    .replaceAll(/[^a-z0-9_-]/gi, (x) => "0x" + x.charCodeAt(0).toString(16));
}

async function* handleLogo(data: any, text: string) {
  const fn = `${slugify(text)}_${new Date().toISOString()}`;
  if ((await generateLogos(text, fn)) === 0) {
    yield await tgCall(
      {
        chat_id: data.message.chat.id,
        reply_to_message_id: data.message.message_id,
        photo: `https://${DOMAIN}/persistent/logos/${fn}.png`,
        caption: `https://${DOMAIN}/persistent/logos/${fn}.svg`,
      },
      "sendPhoto"
    );
  }
}

async function* handleSh(data: any, cmd: string) {
  const id = genRandomToken(32);
  await Deno.writeFile(`${tempDir}/${id}.sh`, new TextEncoder().encode(cmd), {
    createNew: true,
  });

  const outFile = await Deno.open(`${tempDir}/${id}.out`, {
    write: true,
    createNew: true,
  });
  const command = new Deno.Command("bash", {
    args: [`${tempDir}/${id}.sh`],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();

  let length = 0;
  const writer = outFile.writable.getWriter();
  const createWritable = () =>
    new WritableStream({
      write(chunk: Uint8Array) {
        length += chunk.length;
        writer.write(chunk);
      },
    });
  child.stdout.pipeTo(createWritable());
  child.stderr.pipeTo(createWritable());
  child.stdin.close();

  const raceResult = await Promise.race([
    child.status,
    new Promise<void>((resolve) => setTimeout(() => resolve(), 5000)),
  ]);

  if (raceResult !== undefined) {
    yield* reportProcessResult(
      length,
      id,
      data.message.message_id,
      raceResult.code
    );
    return;
  }

  runningProcesses.set(id, child);
  contentTypes.set(id, "application/octet-stream");

  const progressMessageResponse = await tgCall({
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
  });
  yield progressMessageResponse;

  const status = await child.status;
  runningProcesses.delete(id);

  yield await tgCall(
    {
      message_id: progressMessageResponse.result.message_id,
      chat_id: data.message.chat.id,
      reply_markup: {
        inline_keyboard: [],
      },
    },
    "editMessageReplyMarkup"
  );
  yield* reportProcessResult(
    length,
    id,
    progressMessageResponse.result.message_id,
    status.code
  );
}

async function* reportProcessResult(
  length: number,
  id: string,
  reply_to_message_id: number,
  exitCode: number
) {
  const outPath = `${tempDir}/${id}.out`;
  const fileProc = new Deno.Command("file", {
    args: ["-ib", outPath],
    stdout: "piped",
  }).spawn();
  const out = await fileProc.output();
  // need to await the status to not create zombie processes
  const mime = decoder.decode(out.stdout);
  contentTypes.set(id, mime);
  const isText =
    mime.startsWith("text/") || mime.startsWith("application/json");
  let text;
  if (length === 0) text = `No output \\(exit code ${exitCode}\\)\\.`;
  else if (isText && length <= 5000) {
    let res = decoder
      .decode(await Deno.readFile(outPath))
      .replaceAll("\\", "\\\\")
      .replaceAll("`", "\\`");
    if (res.at(-1) !== "\n") res += "\n";
    text = "```\n" + res + "```";
    if (exitCode !== 0) {
      text = `[Exit code ${exitCode}](https://${DOMAIN}/tgweb/${id})\n` + text;
    }
  } else {
    text =
      "[" +
      (isText ? "Output too long" : "Binary output") +
      `](https://${DOMAIN}/tgweb/${id}) \\(exit code ${exitCode}, ${length} bytes\\)\\. Set Content\\-Type with \`/settype ${id} mime/type\``;
  }

  yield await tgCall({
    reply_to_message_id,
    parse_mode: "MarkdownV2",
    text,
  });
}

async function handleCallbackQuery(data: any) {
  const cbData = data.callback_query.data;
  if (cbData.startsWith("kill:")) {
    const proc = runningProcesses.get(cbData.slice(5));
    if (proc === undefined) return;
    const killProc = new Deno.Command("rkill", {
      args: ["-9", proc.pid.toString()],
    }).spawn();
    await killProc.status;
    return;
  }
}

export async function handleTgWeb(e: RequestEvent): Promise<Response | null> {
  const url = new URL(e.request.url);
  const path = url.pathname.slice(7);
  const ct = contentTypes.get(path);
  if (ct === undefined) {
    return new Response("Not found", {
      headers: { "Content-Type": "text/plain" },
      status: 404,
    });
  }

  const file = await Deno.open(`${tempDir}/${path}.out`);
  return new Response(file.readable, {
    headers: { "Content-Type": ct },
  });
}



let imageI = 0;
async function* handleInlineQuery(data: any) {
  const { id: inline_query_id, query, from } = data.inline_query;
  console.log(
    `Logo from ${from.first_name} ${from.last_name} (@${from.username}): ${query}`
  );
  const fn = `inline_${imageI++}_${slugify(query)}_${new Date().toISOString()}`;
  if ((await generateLogos(query, fn)) === 0) {
    yield await tgCall(
      {
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
      },
      "answerInlineQuery"
    );
  }
}

async function* sticekrThis(
  orig_msg: any
): AsyncGenerator<any, string | null, unknown> {
  if (!orig_msg) return "wtf";
  let file;
  if (Array.isArray(orig_msg.photo)) {
    file = orig_msg.photo.at(-1)?.file_id;
  } else if (orig_msg.document?.mime_type?.startsWith("image")) {
    file = orig_msg.document.file_id;
  }
  if (!file) return "not an image file duh";

  const data = await tgCall(
    {
      file_id: file,
    },
    "getFile"
  );
  if (!data.ok) return "telegrams a hoe: " + JSON.stringify(data);

  const resp2 = await fetch(
    `https://api.telegram.org/file/bot${token}/${data.result.file_path}`
  );
  if (!resp2.ok) return "telegram cdn is a hoe: " + (await resp2.text());

  const fileName = await Deno.makeTempFile();
  await Deno.writeFile(fileName, resp2.body!);
  const outFileName = fileName + ".webp";

  const cmd = new Deno.Command("convert", {
    args: [fileName, "-resize", "512x512", outFileName],
  });
  const res = await cmd.output();
  if (res.code !== 0) return "imagemagick is a hoe";
  const sticekr = await Deno.readFile(outFileName);

  const body = new FormData();
  body.append("user_id", STICEKR_SET_OWNER.toString());
  body.append("name", STICEKR_SET_NAME);
  body.append(
    "sticker",
    JSON.stringify({ sticker: "attach://file", emoji_list: ["🤓"] })
  );
  body.append("file", new Blob([sticekr], { type: "image/webp" }), "file.webp");
  const resp3 = await fetch(
    `https://api.telegram.org/bot${token}/addStickerToSet`,
    {
      method: "POST",
      body,
    }
  );
  if (!resp3.ok) return "skill issue: " + (await resp3.text());

  const data4 = await tgCall(
    {
      name: STICEKR_SET_NAME,
    },
    "getStickerSet"
  );
  if (!data4.ok) {
    return "i ran out of error message ideas: " + JSON.stringify(data4);
  }
  const sticekrId = data4.result.stickers.at(-1).file_id;
  if (!sticekrId) return "i ran out of error message ideas the most";

  const resp5 = await tgCall(
    {
      chat_id: orig_msg.chat.id,
      sticker: sticekrId,
    },
    "sendSticker"
  );
  yield resp5;

  if (!resp5.ok) {
    return (
      "actually it succeeded but i failed to send it: " + JSON.stringify(resp5)
    );
  }

  return null;
}
