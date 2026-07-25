export const DINOSAUR_UID = "c838e77e8a599aba7d0b";

const SPOTIFY_QUERY_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
const SPOTIFY_AUTHORIZATION =
  "Bearer BQCWnlfP-dGQG8eRiFRsdx0zBI_OHkgbjJ_FymeSGZaTuqdiVhMfs_YXgmwt7BoY_psA-up3vuHxTO602Yzob5LoqclAVHt11FHGuPPRXkbbQjX7QrrUulzSbom06S4_6H1jPyQeOKA";
const SPOTIFY_CLIENT_TOKEN =
  "AACkhRToXk5jMT7VTSRuEBg6AHBv1c26/mL+wjmFSDPNAC5AOCAX9HNnTZrM0hlX15Ssyivgg8pXrMbAtZHuUJd7Kea/jUKErxKfSfoVpmR/vcYal9k1RoY8BVyGDil1Bgky9VQtEQok84jX1F/L7X9iUerfvA9QWjWbqRYCLnDsHOir5vrCMLDJMaYJZ4Q9zw3d3lr4MaBukKYUJPTWeQoSb+dM0udHyNlB8JeInu0WnYMiRCivU7g1gxgn9mLJ7Xw4KHvQEkqa/GokKVH/A56uI8I83hAXOaodOLmS+3yyQO/sLHY20QF07anVJVU5GEC0owsKvnJYhXkKgvQC7JADTUJgxAw=";

export async function getDinosaurPlaycount(): Promise<number | null> {
  const request = await fetch(SPOTIFY_QUERY_URL, {
    credentials: "include",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0",
      Accept: "application/json",
      "Accept-Language": "en",
      authorization: SPOTIFY_AUTHORIZATION,
      "app-platform": "WebPlayer",
      "spotify-app-version": "896000000",
      "content-type": "application/json;charset=UTF-8",
      "client-token": SPOTIFY_CLIENT_TOKEN,
      "Sec-GPC": "1",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      Priority: "u=4",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
    referrer: "https://open.spotify.com/",
    body:
      '{"variables":{"uri":"spotify:artist:7wwkwCP5b0waa5bhpZCDPq","locale":"","preReleaseV2":false},"operationName":"queryArtistOverview","extensions":{"persistedQuery":{"version":1,"sha256Hash":"7f86ff63e38c24973a2842b672abe44c910c1973978dc8a4a0cb648edef34527"}}}',
    method: "POST",
    mode: "cors",
  });

  if (!request.ok) {
    console.error("Spotify request failed:", request.status);
    return null;
  }

  const data = await request.json();
  const topTracks = data?.data?.artistUnion?.discography?.topTracks?.items;
  if (!Array.isArray(topTracks)) {
    console.error("Unexpected Spotify response:", data);
    return null;
  }

  const dinosaurItem = topTracks.find((track) => track?.uid === DINOSAUR_UID);
  const playcountStr = dinosaurItem?.track?.playcount;
  const playcount = Number(playcountStr);
  if (!Number.isFinite(playcount)) {
    console.error("Invalid playcount:", playcountStr);
    return null;
  }

  return playcount;
}
