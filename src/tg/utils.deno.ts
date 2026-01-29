// deno-lint-ignore-file no-explicit-any
// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)
import { encodeBase64 } from "jsr:@std/encoding@^1.0.10";

export const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN");
export const MAIN_CHAT_ID = parseInt(Deno.env.get("TG_MAIN_CHAT_ID")!);
export const DOMAIN = Deno.env.get("DOMAIN")!;
export const STICEKR_SET_NAME = Deno.env.get("STICKER_SET_NAME")!;
export const STICEKR_SET_OWNER = parseInt(Deno.env.get("STICKER_SET_OWNER")!);
export const PRINTER_TOKEN = Deno.env.get("PRINTER_TOKEN")!;

export const webhookPath = "/tg-webhook";

export function genRandomToken(bytes: number) {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))),
  )
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

export const webhookUrlToken = genRandomToken(96);

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

export async function tgCall(
  options: any,
  endpoint = "sendMessage",
  retryCount = 0,
): Promise<any> {
  if (endpoint == "sendMessage") {
    options.chat_id ??= MAIN_CHAT_ID;
    options.text = options.text?.length > 64
      ? options.text.slice(0, 64) + " bla bla"
      : options.text;
  }

  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  // Apply rate limiting before making the request
  await rateLimitedDelay();

  const req = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    },
  );

  try {
    const resp = await req.json();

    // Handle rate limiting with exponential backoff
    if (!resp.ok && resp.error_code === 429 && retryCount < maxRetries) {
      const retryAfter = resp.parameters?.retry_after ||
        Math.pow(2, retryCount);
      const delay = Math.min(
        baseDelay * Math.pow(2, retryCount),
        retryAfter * 1000,
      );

      console.log(
        `Rate limited on ${endpoint}. Retrying in ${delay}ms (attempt ${
          retryCount + 1
        }/${maxRetries})`,
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
        }/${maxRetries})`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return tgCall(options, endpoint, retryCount + 1);
    }
  }
  return req;
}

export async function řekniTomovi(
  sender: string,
  message: string,
  image: string = "",
  chat_id: number = MAIN_CHAT_ID,
) {
  if (sender) {
    message = `${sender} říká: ${message}`;
  }

  const response = await fetch("https://printomat.slama.dev/submit", {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      message: message,
      image: image,
      token: PRINTER_TOKEN,
    }).toString(),
    method: "POST",
  });
  const txt = await response.text();
  if (chat_id) {
    await tgCall({
      chat_id: chat_id,
      reply_to_message_id: chat_id,
      text: `Tom říká (${response.status}): ${
        /<p>(.*?)<\/p>/.exec(txt)?.[1] ?? txt
      }`,
    });
  }
}

export async function getFileBase64(message: any, maxSize = Infinity) {
  function* files() {
    yield message.sticker?.thumb;
    yield message.sticker?.thumbnail;
    yield message.sticker;
    yield message.video_note?.thumb;
    yield message.video_note?.thumbnail;
    yield message.video_note;
    yield message.video?.thumb;
    yield message.video?.thumbnail;
    yield message.video;
    yield message.document;
    if (message.photo) {
      yield* message.photo;
    }
  }

  let bestCandidate = undefined;
  for (const file of files()) {
    if (
      !file || file.file_size > maxSize ||
      file.file_size < bestCandidate?.file_size
    ) continue;
    bestCandidate = file;
  }

  if (!bestCandidate) {
    return;
  }

  const fileData = await tgCall(
    { file_id: bestCandidate.file_id },
    "getFile",
  );
  const response = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`,
  );
  const fileContent = new Uint8Array(await response.arrayBuffer());
  return encodeBase64(fileContent);
}
