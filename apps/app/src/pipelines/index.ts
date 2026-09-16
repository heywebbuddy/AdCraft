/**
 * Import every pipeline module for its side effect (registerJob). Server actions
 * import this file before calling dispatch() so inline mode always has handlers.
 */
export {};
