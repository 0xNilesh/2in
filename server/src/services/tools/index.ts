// Tool registry singleton — registers every tool exactly once at import time.
// Anything that wants to invoke a tool imports `registry` from here.

import { registry } from './registry.js';
import { readMemory, writeMemory, searchMemory } from './memory.js';
import { store } from './storage.js';
import { draftPost, schedule } from './workflow.js';
import { transcribe, genImage, analyzeImage, findClips } from './compute.js';
import {
  videoTrim, videoReframe, videoBurnCaption, videoAudioEnhance,
  videoSceneCuts, videoGif, videoThumbnail, videoConcat, videoCompress,
  videoProbe, videoSummarize,
  imageResize, imageCrop, imageFormat, imageWatermark, imageEdit,
} from './media.js';

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

// Video editing
registry.register(videoTrim);
registry.register(videoReframe);
registry.register(videoBurnCaption);
registry.register(videoAudioEnhance);
registry.register(videoSceneCuts);
registry.register(videoGif);
registry.register(videoThumbnail);
registry.register(videoConcat);
registry.register(videoCompress);
registry.register(videoProbe);
registry.register(videoSummarize);

// Image editing
registry.register(imageResize);
registry.register(imageCrop);
registry.register(imageFormat);
registry.register(imageWatermark);
registry.register(imageEdit);

export { registry };
export type { Tool, ToolContext, ToolCategory } from './types.js';
