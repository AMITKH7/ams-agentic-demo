const RULES = [
  {
    find: /([Aa]pi[_-]?[Kk]ey|[Tt]oken|[Pp]assword|[Ss]ecret)["'\s]*[:=]["'\s]*[\w\-.]{8,}/g,
    replace: "[REDACTED_SECRET]"
  },
  {
    find: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replace: "[REDACTED_EMAIL]"
  },
  {
    find: /\b(\d{1,3}\.){3}\d{1,3}\b/g,
    replace: "[REDACTED_IP]"
  },
  {
    find: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+/gi,
    replace: "[REDACTED_CONNECTION_STRING]"
  }
];

export function sanitise(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  let text = typeof input === "string" ? input : JSON.stringify(input);

  for (const rule of RULES) {
    text = text.replace(rule.find, rule.replace);
  }

  return text;
}
