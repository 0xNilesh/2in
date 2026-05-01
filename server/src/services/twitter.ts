// Twitter API v2 client. Wraps three operations we need for onboarding:
//   buildAuthorizeUrl  — assemble the OAuth 2.0 authorize URL
//   exchangeCode       — code → access_token (PKCE), then users/me
//   listTweets         — recent tweets for a userId
//
// Errors are normalized to TwitterApiError so the route layer can map them
// to HTTP responses without knowing about Twitter's response shape.

import { Buffer } from 'node:buffer';

const SCOPES = ['tweet.read', 'users.read', 'offline.access'] as const;

export class TwitterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'TwitterApiError';
  }
}

export interface TwitterClientOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

export interface TwitterTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
  tokenType: string;
}

export interface TwitterUser {
  id: string;
  handle: string;
  name: string;
  avatar?: string;
  bio?: string;
  followers?: number;
  following?: number;
  tweetCount?: number;
}

export interface TwitterTweet {
  id: string;
  text: string;
  createdAt: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
  };
  lang?: string;
}

export class TwitterClient {
  private readonly clientId: string;
  private readonly clientSecret?: string;
  private readonly redirectUri: string;

  constructor(opts: TwitterClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.redirectUri = opts.redirectUri;
  }

  buildAuthorizeUrl(args: { state: string; codeChallenge: string }): string {
    const url = new URL('https://twitter.com/i/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('state', args.state);
    url.searchParams.set('code_challenge', args.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(args: { code: string; codeVerifier: string }): Promise<TwitterTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: args.codeVerifier,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (this.clientSecret) {
      headers.Authorization =
        'Basic ' +
        Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TwitterApiError(
        json?.error_description ?? json?.error ?? 'token_exchange_failed',
        res.status,
        json,
      );
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: json.scope,
      tokenType: json.token_type,
    };
  }

  async getMe(accessToken: string): Promise<TwitterUser> {
    const url = new URL('https://api.twitter.com/2/users/me');
    url.searchParams.set(
      'user.fields',
      'username,name,profile_image_url,description,public_metrics',
    );
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TwitterApiError(
        json?.title ?? json?.error ?? 'me_lookup_failed',
        res.status,
        json,
      );
    }
    const d = json.data ?? {};
    return {
      id: d.id,
      handle: d.username,
      name: d.name,
      avatar: d.profile_image_url,
      bio: d.description,
      followers: d.public_metrics?.followers_count,
      following: d.public_metrics?.following_count,
      tweetCount: d.public_metrics?.tweet_count,
    };
  }

  async listTweets(args: {
    accessToken: string;
    userId: string;
    max?: number;
  }): Promise<TwitterTweet[]> {
    const url = new URL(`https://api.twitter.com/2/users/${args.userId}/tweets`);
    url.searchParams.set('max_results', String(Math.min(args.max ?? 20, 100)));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,text,lang');
    url.searchParams.set('exclude', 'retweets,replies');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TwitterApiError(
        json?.title ?? json?.error ?? 'tweets_lookup_failed',
        res.status,
        json,
      );
    }
    return (json.data ?? []).map((t: any): TwitterTweet => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      lang: t.lang,
      metrics: {
        likes: t.public_metrics?.like_count ?? 0,
        retweets: t.public_metrics?.retweet_count ?? 0,
        replies: t.public_metrics?.reply_count ?? 0,
        impressions: t.public_metrics?.impression_count ?? 0,
      },
    }));
  }
}
