// deno-lint-ignore-file no-explicit-any
// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import {
  BOT_TOKEN,
  DOMAIN,
  genRandomToken,
  MAIN_CHAT_ID,
  STICEKR_SET_NAME,
  STICEKR_SET_OWNER,
  tgCall,
  webhookPath,
  webhookUrlToken,
} from "./utils.deno.ts";
import { getDinosaurPlaycount } from "../kruh.deno.ts";
import { geohash } from "../geohash.deno.ts";
import {
  getImageForPoint,
  getUrlForPoint,
  zoomForPoints,
} from "../mapycz.deno.ts";
import { processTgUpdate } from "../replication.deno.ts";

let previousMorningSticker: {
  message_id: number;
  sticker_file_id: string;
  has_reaction: boolean;
} | null = null;

async function domeny() {
  let resp2: any = fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=50.0721117&longitude=14.4052503&daily=temperature_2m_max&forecast_days=1&timezone=Europe/Prague",
  );

  const resp = await fetch(
    "https://auctions-master.nic.cz/share/new_auctions.json",
  );

  let list = ((await resp.json()) as any[])
    .filter(
      (a) =>
        a.auction_from.split("T")[0] === new Date().toISOString().split("T")[0],
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
            `https://archive.org/wayback/available?url=${x}`,
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
      }),
    );
    processTgUpdate(
      await tgCall({
        text: webArchiveLinks.join("\n"),
        parse_mode: "MarkdownV2",
      }),
      0,
    );
  }

  if (previousMorningSticker && !previousMorningSticker.has_reaction) {
    await tgCall({
      chat_id: MAIN_CHAT_ID,
      text: "rip",
      reply_to_message_id: previousMorningSticker.message_id,
    });
    await tgCall(
      { sticker: previousMorningSticker.sticker_file_id },
      "deleteStickerFromSet",
    );
  }

  const {
    result: { stickers: sticekrs },
  }: any = await tgCall(
    {
      name: STICEKR_SET_NAME,
    },
    "getStickerSet",
  );
  const { file_id: sticekr } =
    sticekrs[Math.floor(Math.random() * sticekrs.length)];
  const stickerResponse = await tgCall(
    {
      chat_id: MAIN_CHAT_ID,
      sticker: sticekr,
      reply_to_message_id: 97776,
    },
    "sendSticker",
  );

  if (stickerResponse.ok) {
    previousMorningSticker = {
      message_id: stickerResponse.result.message_id,
      sticker_file_id: sticekr,
      has_reaction: false,
    };
  }

  resp2 = await resp2;
  const data2 = await resp2.json() as any;
  if (data2.daily.temperature_2m_max[0] > 3e1) {
    await tgCall(
      {
        chat_id: MAIN_CHAT_ID,
        sticker:
          "CAACAgQAAxUAAWo6WhwK68k09wt9ygABCHWwL5Zc1wACjiEAAnG90FEj5f-tjMk0UzwE",
      },
      "sendSticker",
    );
  }
}

export function checkStickerReaction(stickerMessageId: number) {
  if (
    previousMorningSticker &&
    previousMorningSticker.message_id === stickerMessageId
  ) {
    previousMorningSticker.has_reaction = true;
  }
}

const hashOrigins = [{ lat: 50.1005803, lon: 14.3954325 }];

const users: Record<string, string> = {
  mvolfik: "Matěj",
  chamik: "Kubík",
  CloudMracek: "Honza",
  marekmaskarinec: "Marek",
  mariansam: "Marain",
  Matuush: "Matúš",
  ProkopRandacek: "Prokop",
  WIPocket: "Adam",
  topberry: "Honzak",
  Ouolim: "Janek",
};

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

  for (const origin of hashOrigins) {
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

    const text = `[ ](${
      getImageForPoint(
        meta,
      )
    })Today's geohash is at [${
      geoHash.lat
        .toFixed(5)
        .replace(".", "\\.")
    } ${
      geoHash.lon
        .toFixed(5)
        .replace(".", "\\.")
    }](${
      getUrlForPoint(
        meta,
      )
    })\\.\nPlease refer to xkcd\\.com/426/ for further steps\\.`;

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
                "https://%73%6e%65%64%6c-%75%7a-%6b%75%62%69%6b-%70%6f%6e%6f%7a%6b%75.%67%69%74%68%75%62.%69%6f",
              )
            ).text()
          )
            .replace(/\r|<[^>]+>/g, "")
            .replace(/\s{2,}/gm, "\n")
            .trim(),
        }),
      Math.random() * 600000 + 600000,
    );
  }
}

const bootId = genRandomToken(16);

let tempDir = "";
let dinosaurMillionAnnounced = false;

export function getTempDir() {
  return tempDir;
}

export async function init() {
  if (
    !BOT_TOKEN ||
    !DOMAIN ||
    isNaN(MAIN_CHAT_ID) ||
    !STICEKR_SET_NAME ||
    isNaN(STICEKR_SET_OWNER)
  ) {
    console.log(
      `TG_BOT_TOKEN: ${BOT_TOKEN}, TG_MAIN_CHAT_ID: ${MAIN_CHAT_ID}, DOMAIN: ${DOMAIN}, STICEKR_SET_NAME: ${STICEKR_SET_NAME}, STICEKR_SET_OWNER: ${STICEKR_SET_OWNER}`,
    );
    throw new Error(
      "TG_BOT_TOKEN, TG_MAIN_CHAT_ID, DOMAIN, STICEKR_SET_NAME or STICEKR_SET_OWNER is not set",
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
    "setWebhook",
  );

  setTimeout(async () => {
    const username = "<BUILD_ACTOR>";
    const name = users[username] ?? "Nějakej impostor";
    await tgCall({
      chat_id: MAIN_CHAT_ID,
      text: `${name} zase kazí všechnu zábavu`,
    });
    await tgCall(
      {
        photo: `https://${DOMAIN}/startup.jpg?q=2${bootId}`,
        chat_id: MAIN_CHAT_ID,
      },
      "sendPhoto",
    );
  }, 2000);

  Deno.cron("tuuuuuuuuuu", "0 12 * * 4#1", () => {
    tgCall({
      text:
        "TÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚÚ",
    });
  });

  Deno.cron("Oh no Here comes one now", "0 20 * * *", () => {
    if (previousMorningSticker && !previousMorningSticker.has_reaction) {
      tgCall(
        {
          photo: `https://${DOMAIN}/gonnagetcha.jpg?q=${bootId}`,
          chat_id: MAIN_CHAT_ID,
          reply_to_message_id: previousMorningSticker.message_id,
        },
        "sendPhoto",
      );
    }
  });

  Deno.cron("jakej je tvuj", "*/30 * * * *", async () => {
    if (dinosaurMillionAnnounced) return;
    const playcount = await getDinosaurPlaycount();
    if (playcount === null) return;
    if (playcount >= 1_000_000) {
      dinosaurMillionAnnounced = true;
      await tgCall({
        chat_id: MAIN_CHAT_ID,
        text: 'Dinosaur má milion na Spotify!!',
      });
    }
  });

  postGeohash();
}
