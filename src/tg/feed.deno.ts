// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { BOT_TOKEN, DOMAIN, tgCall } from "./utils.deno.ts";

const serviceFeedItems: {
  title: string;
  description: string;
  guid: string;
  pubDate: string;
  imageBase64?: string;
}[] = [];
const MAX_SERVICE_FEED_ITEMS = 100;
const SERVICE_FEED_STORAGE_PATH = "./static/persistent/rss-service-feed.json";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function loadServiceFeedItems() {
  try {
    const raw = Deno.readTextFileSync(SERVICE_FEED_STORAGE_PATH);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const item of parsed.slice(0, MAX_SERVICE_FEED_ITEMS)) {
      if (
        typeof item?.title === "string" &&
        typeof item?.description === "string" &&
        typeof item?.guid === "string" &&
        typeof item?.pubDate === "string" &&
        (item.imageBase64 === undefined || typeof item.imageBase64 === "string")
      ) {
        serviceFeedItems.push(item);
      }
    }
    // deno-lint-ignore no-explicit-any
  } catch (error: any) {
    if (error?.name !== "NotFound") {
      console.error("Failed to load RSS feed cache:", error);
    }
  }
}

function persistServiceFeedItems() {
  try {
    Deno.mkdirSync("./static/persistent", { recursive: true });
    Deno.writeTextFileSync(
      SERVICE_FEED_STORAGE_PATH,
      JSON.stringify(serviceFeedItems),
    );
  } catch (error) {
    console.error("Failed to persist RSS feed cache:", error);
  }
}

/** Downloads a static (webp) sticker as base64; null if unavailable. */
export async function fetchStickerBase64(
  fileId: string,
): Promise<string | null> {
  try {
    const fileData = await tgCall({ file_id: fileId }, "getFile");
    const path: string | undefined = fileData?.result?.file_path;
    if (!path?.endsWith(".webp")) return null;
    const response = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`,
    );
    if (!response.ok) return null;
    return encodeBase64(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    console.error("Failed to fetch sticker for RSS feed:", error);
    return null;
  }
}

/** Unix timestamp in seconds; defaults to now. */
export function addServiceFeedItem(
  title: string,
  description: string,
  date?: number,
  imageBase64?: string | null,
) {
  serviceFeedItems.unshift({
    title,
    description,
    guid: crypto.randomUUID(),
    ...(imageBase64 ? { imageBase64 } : {}),
    pubDate: (typeof date === "number" ? new Date(date * 1000) : new Date())
      .toUTCString(),
  });
  if (serviceFeedItems.length > MAX_SERVICE_FEED_ITEMS) {
    serviceFeedItems.length = MAX_SERVICE_FEED_ITEMS;
  }
  persistServiceFeedItems();
}

export function recordServiceFeedEvent(
  event: { title: string; description: string } | null,
  date?: number,
) {
  if (event) addServiceFeedItem(event.title, event.description, date);
}

export function getServiceFeedRssXml(): string {
  const items = serviceFeedItems.map((item) =>
    `<item><title>${escapeXml(item.title)}</title><description>${
      escapeXml(
        item.description + (item.imageBase64
          ? `<br/><img src="data:image/webp;base64,${item.imageBase64}"/>`
          : ""),
      )
    }</description><guid>${item.guid}</guid><pubDate>${item.pubDate}</pubDate></item>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>0d9e Telegram Service Feed</title><link>https://${DOMAIN}/rss.xml</link><description>Telegram service events: sticker added/removed and group rename</description>${items}</channel></rss>`;
}

loadServiceFeedItems();
