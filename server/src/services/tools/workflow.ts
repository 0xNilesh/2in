// Workflow tools — pure local stubs. PLAN.md §14 explicitly keeps platform
// auto-POST out of scope; draft_post stages content to an in-memory store
// the user can review later. schedule registers a future-fire job.
//
// In-memory only on purpose — these are demo surfaces; persistence layer
// would swap in Postgres / BullMQ.

import { z } from 'zod';
import crypto from 'node:crypto';
import type { Tool } from './types.js';

export interface StagedPost {
  id: string;
  platform: string;
  content: string;
  stagedAt: number;
}

export interface ScheduledJob {
  id: string;
  when: string;
  action: string;
  scheduledAt: number;
}

const stagedPosts = new Map<string, StagedPost>();
const scheduledJobs = new Map<string, ScheduledJob>();

export function getStagedPost(id: string): StagedPost | undefined {
  return stagedPosts.get(id);
}

export function listStagedPosts(): StagedPost[] {
  return Array.from(stagedPosts.values()).sort((a, b) => b.stagedAt - a.stagedAt);
}

export function listScheduledJobs(): ScheduledJob[] {
  return Array.from(scheduledJobs.values()).sort((a, b) => a.when.localeCompare(b.when));
}

export const draftPost: Tool = {
  name: 'draft_post',
  description: 'Stage a post for review on a platform (X, IG, LinkedIn, …). Does not publish.',
  category: 'workflow',
  input: z.object({
    platform: z.enum(['x', 'twitter', 'instagram', 'tiktok', 'youtube', 'linkedin']),
    content: z.string().min(1).max(8000),
    mediaUrl: z.string().url().optional(),
  }),
  execute: async (input) => {
    const post: StagedPost = {
      id: `post-${crypto.randomBytes(4).toString('hex')}`,
      platform: input.platform === 'twitter' ? 'x' : input.platform,
      content: input.content,
      stagedAt: Date.now(),
    };
    stagedPosts.set(post.id, post);
    return { ...post, mediaUrl: input.mediaUrl ?? null, status: 'staged' };
  },
};

export const schedule: Tool = {
  name: 'schedule',
  description: 'Register a future-fire job. Action is a free-form string the runner picks up later.',
  category: 'workflow',
  input: z.object({
    when: z.string().min(1).describe('ISO datetime or relative ("in 30m", "tomorrow 09:00")'),
    action: z.string().min(1),
  }),
  execute: async (input) => {
    const job: ScheduledJob = {
      id: `job-${crypto.randomBytes(4).toString('hex')}`,
      when: input.when,
      action: input.action,
      scheduledAt: Date.now(),
    };
    scheduledJobs.set(job.id, job);
    return { ...job, status: 'scheduled' };
  },
};
