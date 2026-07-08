export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const waitMs = attempt * 1000;
        console.warn(`[retry] ${label} failed on attempt ${attempt}. Retrying in ${waitMs}ms.`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`[retry] ${label} failed after ${maxAttempts} attempts: ${message}`);
}
