export function makeTraceId(seed: string): string {
  const cleanSeed = seed || "UNKNOWN";
  return `AMS-${cleanSeed}-${Date.now()}`;
}

export function addTraceHeader(
  headers: Record<string, string>,
  traceHeaderName: string,
  traceId: string
): Record<string, string> {
  return {
    ...headers,
    [traceHeaderName]: traceId
  };
}
