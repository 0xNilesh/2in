// Tool registry singleton — registers every tool exactly once at import time.
// Anything that wants to invoke a tool imports `registry` from here.

import { registry } from './registry.js';
import { readMemory, writeMemory, searchMemory } from './memory.js';
import { store } from './storage.js';
import { draftPost, schedule } from './workflow.js';
import { transcribe, genImage, analyzeImage, findClips } from './compute.js';

registry.register(readMemory);
registry.register(writeMemory);
registry.register(searchMemory);
registry.register(store);
registry.register(draftPost);
registry.register(schedule);
registry.register(transcribe);
registry.register(genImage);
registry.register(analyzeImage);
registry.register(findClips);

export { registry };
export type { Tool, ToolContext, ToolCategory } from './types.js';
