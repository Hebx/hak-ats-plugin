/**
 * REGRESSION GUARD — tool parameter schemas must be fully inlined (no `$ref`/`$defs`).
 *
 * Google's Generative Language API (Gemini function-calling) rejects JSON-Schema
 * `$ref`/`$defs` inside `function_declarations` with a 400 ("Unknown name \"$ref\"").
 * `zod-to-json-schema` emits a `$ref` whenever the SAME zod schema instance is reused
 * across multiple fields of one object (it deduplicates the repeat). That regressed in
 * 0.4.0 when `addressOrId` was a shared const reused for `diamondAddress`/`from`/`to`/
 * `investor`, and broke every Gemini-backed tool call. The fix made `addressOrId` a
 * factory so each field gets an independent, inlined schema.
 *
 * This test reproduces the exact conversion LangChain does and fails if any tool's
 * parameter schema carries a `$ref` or a definitions block. No network, no HBAR, no LLM.
 */
import { describe, it, expect } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { atsPlugin } from '../../src/index.js';

// tools() only reads context to construct; an empty object is enough off-network.
const tools = atsPlugin.tools({} as Parameters<typeof atsPlugin.tools>[0]);

describe('tool parameter schemas are fully inlined (Gemini-safe)', () => {
  it('registers the full tool surface', () => {
    expect(tools.length).toBe(14);
  });

  it.each(tools.map((t) => [t.method, t] as const))('%s emits no $ref/$defs', (_method, tool) => {
    const json = JSON.stringify(zodToJsonSchema(tool.parameters));
    expect(json).not.toContain('$ref');
    expect(json).not.toContain('definitions');
    expect(json).not.toContain('$defs');
  });
});
