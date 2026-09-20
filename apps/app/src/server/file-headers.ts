/**
 * Headers for anything we serve out of object storage. Stored files are user-supplied, so they
 * must never run as a page on our origin.
 *
 * SVG keeps its real type — brand logos are rendered with <img> — but the sandbox CSP stops any
 * script inside it from running if someone opens the file directly. HTML and XML have no such
 * use here, so they are sent as downloads.
 */
export function fileHeaders(key: string, contentType: string, cacheControl: string): HeadersInit {
  const isSvg = /^image\/svg\+xml$/i.test(contentType) || /\.svg$/i.test(key);
  const isMarkup = /^(text\/html|application\/xhtml\+xml|text\/xml|application\/xml)$/i.test(contentType) || /\.(html?|xhtml|xml)$/i.test(key);
  const name = (key.split("/").pop() ?? "file").replace(/["\\]/g, "");
  return {
    "content-type": isMarkup ? "application/octet-stream" : contentType,
    "content-disposition": isMarkup ? `attachment; filename="${name}"` : "inline",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    // `sandbox` with no allow-scripts: an SVG opened directly cannot run script or navigate.
    "content-security-policy": isSvg || isMarkup ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" : "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox",
  };
}
