export async function withRetry(task, options = {}) {
  const {
    maxAttempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 20000,
    classifyError = defaultErrorClassifier,
    label = 'request',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const errorClass = classifyError(error);
      const transient = isTransientErrorClass(errorClass);

      if (!transient || attempt === maxAttempts) {
        console.log(`[retry] ${label} failed permanently`, {
          attempt,
          maxAttempts,
          errorClass,
          message: error?.message,
        });
        throw error;
      }

      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitterMultiplier = 0.8 + Math.random() * 0.4;
      const delay = Math.round(backoff * jitterMultiplier);

      console.log('[retry] transient failure, retrying', {
        label,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: delay,
        errorClass,
        message: error?.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function defaultErrorClassifier(error) {
  if (!error) return 'unknown';
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return 'connection_error';
  if (typeof error.status === 'number') return `http_${error.status}`;
  return 'unknown';
}

function isTransientErrorClass(errorClass) {
  if (!errorClass) return false;
  if (errorClass === 'connection_error') return true;
  if (errorClass === 'http_408') return true;
  if (errorClass === 'http_409') return true;
  if (errorClass === 'http_429') return true;
  if (/^http_5\d\d$/.test(errorClass)) return true;
  return false;
}
