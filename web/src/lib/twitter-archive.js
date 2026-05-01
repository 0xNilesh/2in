// Parses a tweets.js file from a Twitter / X account archive.
// Format (since 2018):
//   window.YTD.tweets.partN = [
//     { "tweet": { "id_str": "...", "full_text": "...", "created_at": "...", ... } },
//     ...
//   ]
//
// We strip the prefix, parse the JSON array, normalize each tweet to the same
// shape `services/twitter.ts` returns, drop retweets + replies for a clean
// voice corpus, and return the result.

export class TweetsJsParseError extends Error {}

export function parseTweetsJs(text) {
  const eqIdx = text.indexOf('=');
  if (eqIdx < 0) {
    throw new TweetsJsParseError(
      "Doesn't look like tweets.js — no `window.YTD.tweets.partN = [...]` assignment found.",
    );
  }
  const json = text.slice(eqIdx + 1).trim().replace(/;$/, '');
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new TweetsJsParseError(`Failed to parse tweets.js JSON: ${err.message}`);
  }
  if (!Array.isArray(raw)) {
    throw new TweetsJsParseError('tweets.js root is not an array.');
  }
  return normalize(raw);
}

function normalize(raw) {
  return raw
    .map((entry) => entry?.tweet ?? entry)
    .filter(Boolean)
    .map(toTweet)
    .filter((t) => !t.isRetweet && !t.isReply && t.text.trim().length > 0)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function toTweet(t) {
  const text = t.full_text ?? t.text ?? '';
  return {
    id: t.id_str ?? String(t.id ?? ''),
    text,
    createdAt: t.created_at ?? null,
    metrics: {
      likes: Number(t.favorite_count ?? 0),
      retweets: Number(t.retweet_count ?? 0),
      replies: 0, // archive doesn't include reply counts
      impressions: 0,
    },
    lang: t.lang,
    isRetweet: Boolean(t.retweeted_status) || /^RT @/.test(text),
    isReply: Boolean(t.in_reply_to_status_id ?? t.in_reply_to_status_id_str),
  };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsText(file);
  });
}

// Convenience: take a File, return normalized tweets.
export async function tweetsFromFile(file) {
  const text = await readFileAsText(file);
  return parseTweetsJs(text);
}
