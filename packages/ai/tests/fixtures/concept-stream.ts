import type { Concept } from "../../src/concepts";

export const testConcept = (index: number): Concept => ({ title: `Idea ${index}`, kind: "static", angle: "problem/solution", hook: `Idea ${index}: café, a {brace}, a "quote", and a \\ slash.`, headline: `Headline ${index}`, primaryText: "An honest message.", description: "", cta: "Learn more", visualDirection: "A warm studio", scenePrompt: "Empty warm studio background", script: "", platformFit: ["meta"] });

/** Controlled provider stream: tests decide when each concept and the final event arrive. */
export function anthropicStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const send = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  send({ type: "message_start", message: { id: "test-message", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  const text = (value: string) => send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: value } });
  return {
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    text,
    finish(reason = "end_turn") {
      send({ type: "content_block_stop", index: 0 });
      send({ type: "message_delta", delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 100 } });
      send({ type: "message_stop" });
      controller.close();
    },
  };
}
