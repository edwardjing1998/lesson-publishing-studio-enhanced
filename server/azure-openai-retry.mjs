// Process-local pacing and Azure OpenAI throttling handling for vision requests.
// One transport instance is shared by all Deep Review calls in this Node process.
// Multi-replica deployments require a distributed limiter/queue as well.

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export function parseAzureRetryAfterMs(headers, now = Date.now()) {
  const milliseconds = headers.get('retry-after-ms');
  if (milliseconds !== null && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0) {
    return Math.ceil(Number(milliseconds));
  }
  const raw = headers.get('retry-after');
  if (raw === null) return null;
  const seconds = Number(raw);
  if (raw.trim() && Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export function retryDelayMs(attempt, headers, {
  baseMs = 5000, maxMs = 120000, random = Math.random, now = Date.now()
} = {}) {
  const fromServer = parseAzureRetryAfterMs(headers, now);
  // Respect explicit service guidance, including Retry-After dates.
  if (fromServer !== null) return fromServer;
  const ceiling = Math.min(maxMs, baseMs * (2 ** attempt));
  // Jitter avoids simultaneous retries across clients/pods.
  return Math.round(ceiling * (0.5 + 0.5 * random()));
}

export function createAzureOpenAIRetryTransport({
  fetchImpl = fetch,
  sleepImpl = pause,
  now = () => Date.now(),
  random = Math.random,
  minIntervalMs = boundedInteger(process.env.AZURE_VISION_MIN_INTERVAL_MS, 4000, 0, 60000),
  maxRetries = boundedInteger(process.env.AZURE_VISION_MAX_RETRIES, 5, 0, 10),
  baseDelayMs = boundedInteger(process.env.AZURE_VISION_RETRY_BASE_MS, 5000, 100, 120000),
  maxDelayMs = boundedInteger(process.env.AZURE_VISION_RETRY_MAX_MS, 120000, 1000, 600000),
  maxTotalDelayMs = boundedInteger(process.env.AZURE_VISION_MAX_TOTAL_RETRY_MS, 600000, 1000, 3600000)
} = {}) {
  let queue = Promise.resolve();
  let lastRequestStart = null;

  // Serializes all requests using this transport, including retries. A completed
  // or rejected request cannot poison the queue for the next one.
  function request(url, options, {onRetry} = {}) {
    const work = queue.catch(() => {}).then(async () => {
      let totalDelay = 0;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (lastRequestStart !== null) {
          const wait = Math.max(0, minIntervalMs - (now() - lastRequestStart));
          if (wait > 0) await sleepImpl(wait);
        }
        lastRequestStart = now();
        const response = await fetchImpl(url, options);
        if (![429, 503].includes(response.status)) return response;
        if (attempt >= maxRetries) return response;
        const delayMs = retryDelayMs(attempt, response.headers, {
          baseMs: baseDelayMs, maxMs: maxDelayMs, random, now: now()
        });
        if (totalDelay + delayMs > maxTotalDelayMs) return response;
        totalDelay += delayMs;
        onRetry?.({status: response.status, attempt: attempt + 1, maxRetries,
          delayMs, totalDelayMs: totalDelay});
        // Discard unsuccessful response body to release the connection.
        await response.arrayBuffer().catch(() => {});
        await sleepImpl(delayMs);
      }
      throw new Error('Unreachable Azure OpenAI retry state');
    });
    queue = work.then(() => {}, () => {});
    return work;
  }
  return {request};
}

export const azureOpenAIVisionTransport = createAzureOpenAIRetryTransport();
