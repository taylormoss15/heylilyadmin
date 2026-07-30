// Find and swap image URLs inside a custom-HTML page. Used by the editor's
// "replace an image" flow so an operator can drop in a higher-res file (or a
// different photo) in place of an existing one — a deterministic string swap,
// no AI, so the layout is never disturbed.

export function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();

  const imgRe = /<img[^>]+\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) urls.add(m[1]);

  // CSS background-image / inline style url(...)
  const bgRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = bgRe.exec(html))) urls.add(m[1]);

  return [...urls].filter(
    (u) => /^https?:\/\//i.test(u) && !/\.svg(\?|$)/i.test(u)
  );
}

// Replace every occurrence of an exact URL. Plain split/join avoids any regex
// escaping issues with query strings and special characters in URLs.
export function replaceImageUrl(html: string, oldUrl: string, newUrl: string): { html: string; count: number } {
  if (!oldUrl || oldUrl === newUrl) return { html, count: 0 };
  const parts = html.split(oldUrl);
  return { html: parts.join(newUrl), count: parts.length - 1 };
}
