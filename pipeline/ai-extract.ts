import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFileSync } from 'node:fs';
import { type AiExtraction, AiExtractionSchema } from './models/ai-extraction';
import type { Rec } from './models/record';

const MODEL = 'claude-sonnet-5-5';
const PROMPT = readFileSync('pipeline/prompt.md', 'utf8');

// Created on first use, so an up-to-date build needs no API key.
let client: Anthropic | undefined;

// Every failure (refusal, max_tokens, bad output, network) returns null after the SDK's own retries.
export async function aiExtract(rec: Rec): Promise<AiExtraction | null> {
  try {
    const res = await (client ??= new Anthropic()).messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: PROMPT,
      output_config: { effort: 'low', format: zodOutputFormat(AiExtractionSchema) },
      messages: [{ role: 'user', content: `<record>\n${JSON.stringify(rec)}\n</record>` }],
    });

    if (!res.parsed_output) {
      console.warn(`${rec.id}: ${res.stop_reason}`);
    }

    return res.parsed_output ?? null;
  } catch (e) {
    console.warn(`${rec.id}: ${e}`);
    return null;
  }
}
