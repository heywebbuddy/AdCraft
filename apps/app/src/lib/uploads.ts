/** Shared upload limits for product photos and logos. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
export const LOGO_TYPES = [...IMAGE_TYPES, "image/svg+xml"] as const;
export const LOGO_ACCEPT = LOGO_TYPES.join(",");
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PRODUCT_EDGE = 2048;
export const MAX_LOGO_EDGE = 1024;
