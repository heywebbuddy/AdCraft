import { ConceptSchema, ConceptsOutputSchema, type Concept, type ConceptsOutput } from "../concepts";

/** Incrementally read the objects in {"concepts":[...]}, never publishing partial JSON.
 * Track strings and escapes so braces in ad copy cannot end a concept early.
 */
export class ConceptStreamParser {
  private text = "";
  private cursor = 0;
  private opened = false;
  private closed = false;
  private start = -1;
  private depth = 0;
  private quoted = false;
  private escaped = false;

  push(delta: string): Concept[] {
    this.text += delta;
    const ready: Concept[] = [];
    if (!this.opened) {
      const opening = /^\s*\{\s*"concepts"\s*:\s*\[/.exec(this.text);
      if (!opening) return ready;
      this.cursor = opening[0].length;
      this.opened = true;
    }
    for (; this.cursor < this.text.length && !this.closed; this.cursor++) {
      const char = this.text[this.cursor]!;
      if (this.start < 0) {
        if (/\s|,/.test(char)) continue;
        if (char === "]") { this.closed = true; break; }
        if (char !== "{") throw new Error("Expected a concept object in the streamed response");
        this.start = this.cursor;
        this.depth = 1;
        continue;
      }
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === "\\") this.escaped = true;
        else if (char === '"') this.quoted = false;
      } else if (char === '"') this.quoted = true;
      else if (char === "{") this.depth++;
      else if (char === "}" && --this.depth === 0) {
        ready.push(ConceptSchema.parse(JSON.parse(this.text.slice(this.start, this.cursor + 1))));
        this.start = -1;
      }
    }
    return ready;
  }

  finish(): ConceptsOutput {
    return ConceptsOutputSchema.parse(JSON.parse(this.text));
  }
}

/** SSE framing independent of network chunk boundaries, including split UTF-8. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
        if (data) yield data;
      }
      if (done) {
        if (buffer.trim()) throw new Error("The concept stream ended with an incomplete event");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
