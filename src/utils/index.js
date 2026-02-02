// src/utils/index.js

export function createPageUrl(basePath, params = {}) {
  const url = new URL(basePath, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  return url.pathname + url.search;
}
