import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { generateConcepts } from "../src/anthropic";
import { ConceptStreamParser, sseData } from "../src/text/concept-stream";
import { generateConceptsOpenAI } from "../src/text/openai-chat";
import { type ConceptBrief } from "../src/concepts";
import { anthropicStream, testConcept } from "./fixtures/concept-stream";

const brief: ConceptBrief = { brand: { name: "Test" }, audience: "Test audience", objective: "awareness", platforms: ["meta"], formats: ["static"], count: 2 };

test("complete concepts are parsed across every character boundary, including escaped braces and quotes", () => {
  const parser = new ConceptStreamParser();
  const first = testConcept(1), second = testConcept(2);
  const prefix = `{"concepts":[${JSON.stringify(first)}`;
  const ready = [...prefix].flatMap(char => parser.push(char));
  assert.deepEqual(ready, [first], "the first object is available without the rest of the array");
  assert.throws(() => parser.finish(), "incomplete JSON cannot finish the run");
  assert.deepEqual([...`,${JSON.stringify(second)}]}`].flatMap(char => parser.push(char)), [second]);
  assert.deepEqual(parser.finish().concepts, [first, second]);
  assert.deepEqual(parser.push("\n"), [], "final whitespace cannot re-emit a concept");
});

test("incomplete or schema-invalid objects are never published", () => {
  const parser = new ConceptStreamParser();
  assert.deepEqual(parser.push('{"concepts":[{"title":"incomplete"'), []);
  assert.throws(() => parser.push('}]}'));
});

test("SSE handles CRLF, multibyte text, comments, and one-byte network chunks", async () => {
  const bytes = new TextEncoder().encode(': ping\r\n\r\ndata: {"text":"café"}\r\n\r\ndata: [DONE]\r\n\r\n');
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
  const received: string[] = [];
  for await (const data of sseData(body)) received.push(data);
  assert.deepEqual(received, ['{"text":"café"}', '[DONE]']);
});

test("Anthropic delivers a validated concept before the provider finishes and preserves final usage", async () => {
  const stream = anthropicStream();
  const client = new Anthropic({ apiKey: "synthetic", fetch: async () => stream.response });
  const seen: number[] = [];
  const result = generateConcepts(brief, { client, onConcept: async (concept, index) => {
    assert.deepEqual(concept, testConcept(index + 1));
    seen.push(index);
    if (index === 0) { stream.text(`,${JSON.stringify(testConcept(2))}]}`); stream.finish(); }
  } });
  stream.text(`{"concepts":[${JSON.stringify(testConcept(1))}`);
  const complete = await result;
  assert.deepEqual(seen, [0, 1]);
  assert.equal(complete.usage.outputTokens, 100);
  assert.equal(complete.output.concepts.length, 2);
});

test("a truncated Anthropic stream keeps the first delivered concept and fails the run", async () => {
  const stream = anthropicStream();
  const seen: number[] = [];
  const result = generateConcepts(brief, { client: new Anthropic({ apiKey: "synthetic", fetch: async () => stream.response }), onConcept: async (_, index) => { seen.push(index); stream.finish("max_tokens"); } });
  stream.text(`{"concepts":[${JSON.stringify(testConcept(1))}`);
  await assert.rejects(result);
  assert.deepEqual(seen, [0]);
});

test("OpenAI-compatible streaming publishes the first idea before EOF and captures usage", async () => {
  const original = globalThis.fetch;
  const key = process.env.CONCEPT_TEST_KEY;
  process.env.CONCEPT_TEST_KEY = "synthetic";
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const send = (data: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`));
  globalThis.fetch = async (_, init) => {
    assert.equal(JSON.parse(init!.body as string).stream, true);
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
  try {
    const seen: number[] = [];
    const result = generateConceptsOpenAI(brief, { id: "test-model", kind: "text", provider: "openai", label: "Test", creditsPerUnit: 1, apiKeyEnv: "CONCEPT_TEST_KEY" }, async (_, index) => {
      seen.push(index);
      if (index === 0) {
        send({ choices: [{ index: 0, delta: { content: `,${JSON.stringify(testConcept(2))}]}` }, finish_reason: "stop" }] });
        send({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 34 } });
        send("[DONE]"); controller.close();
      }
    });
    send({ choices: [{ index: 0, delta: { content: `{"concepts":[${JSON.stringify(testConcept(1))}` } }] });
    const complete = await result;
    assert.deepEqual(seen, [0, 1]);
    assert.equal(complete.usage.inputTokens, 12);
    assert.equal(complete.usage.outputTokens, 34);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.CONCEPT_TEST_KEY; else process.env.CONCEPT_TEST_KEY = key; }
});
