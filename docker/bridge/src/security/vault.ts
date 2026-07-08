export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0 || value === "FILL_IN_LATER") {
    throw new Error(`Required environment variable is missing or not set: ${name}`);
  }

  return value;
}
