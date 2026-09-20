function parseOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "";
  }
}

export function validateSameOrigin(request) {
  const expectedOrigin = parseOrigin(request?.url);
  if (!expectedOrigin) return { valid: false, source: "request-url" };

  const origin = request.headers.get("origin");
  if (origin) {
    return {
      valid: parseOrigin(origin) === expectedOrigin,
      source: "origin",
    };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return {
      valid: parseOrigin(referer) === expectedOrigin,
      source: "referer",
    };
  }

  return { valid: false, source: "missing" };
}
