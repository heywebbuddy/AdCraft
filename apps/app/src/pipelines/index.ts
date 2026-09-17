/**
 * Import every pipeline module for its side effect (registerJob). Server actions
 * import this file before calling dispatch() so inline mode always has handlers.
 */
import "./concepts";
import "./static";
import "./render";
import "./product-cutout";
import "./video";
import "./ugc";
import "./character";

import "./publish";
import "./insights";

export {};
