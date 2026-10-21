import { sendResult } from './callback';
import { loadConfig } from './config';
import { createHandler } from './handler';
import { createS3Store } from './s3';

// Lambda entry point: handler "index.handler". Configuration is read once at cold
// start, and a missing or invalid value throws here, which shows up as a visible
// initialisation error rather than every image failing one at a time.
const config = loadConfig();

export const handler = createHandler({
  store: createS3Store(),
  config,
  notify: (mediaId, result) => sendResult(config, mediaId, result),
});
