import { z } from 'zod';
import { ExtractorErrorCode } from '@/types/booking';

/**
 * STEP 3: LLM Provider Abstraction (Section 15)
 * Decouples model calls from business and state logic.
 * Guarantees zero secret exposure to client.
 */

export interface ILLMProvider {
  readonly providerName: string;
  generateRaw(prompt: string, systemPrompt: string): Promise<string>;
}

/**
 * Groq Provider (Llama-3.3-70B with JSON Mode)
 */
export class GroqProvider implements ILLMProvider {
  readonly providerName = 'groq';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'llama-3.3-70b-versatile') {
    this.apiKey = apiKey || process.env.GROQ_API_KEY || '';
    this.model = model;
  }

  async generateRaw(prompt: string, systemPrompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          max_tokens: 800
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('RATE_LIMITED: Groq API rate limit exceeded');
        }
        const errorText = await res.text();
        throw new Error(`Groq API returned ${res.status}: ${errorText}`);
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content || '';
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error('API_TIMEOUT: Groq request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * OpenAI Provider (GPT-4o-mini with JSON Mode)
 */
export class OpenAIProvider implements ILLMProvider {
  readonly providerName = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model;
  }

  async generateRaw(prompt: string, systemPrompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          max_tokens: 800
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('RATE_LIMITED: OpenAI API rate limit exceeded');
        }
        const errorText = await res.text();
        throw new Error(`OpenAI API returned ${res.status}: ${errorText}`);
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content || '';
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error('API_TIMEOUT: OpenAI request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Mock LLM Provider for Unit Tests (Zero External Network Calls)
 */
export class MockLLMProvider implements ILLMProvider {
  readonly providerName = 'mock';
  private responseGenerator: (prompt: string, systemPrompt: string) => string | Promise<string>;

  constructor(
    responseGenerator: (prompt: string, systemPrompt: string) => string | Promise<string>
  ) {
    this.responseGenerator = responseGenerator;
  }

  async generateRaw(prompt: string, systemPrompt: string): Promise<string> {
    return this.responseGenerator(prompt, systemPrompt);
  }
}

/**
 * High-Level LLM Client
 * Orchestrates provider resolution, JSON parsing, and strict Zod validation.
 */
export class LLMClient {
  private provider: ILLMProvider;

  constructor(customProvider?: ILLMProvider) {
    if (customProvider) {
      this.provider = customProvider;
    } else if (process.env.GROQ_API_KEY) {
      this.provider = new GroqProvider();
    } else if (process.env.OPENAI_API_KEY) {
      this.provider = new OpenAIProvider();
    } else {
      // Default fallback mock provider when running locally without keys
      this.provider = new MockLLMProvider(() => {
        throw new Error('MISSING_API_KEY: No LLM API key configured');
      });
    }
  }

  getProviderName(): string {
    return this.provider.providerName;
  }

  /**
   * Generates structured output validated against a Zod schema.
   */
  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema: z.ZodSchema<T>
  ): Promise<{
    success: boolean;
    data?: T;
    error?: {
      code: ExtractorErrorCode;
      message: string;
      rawOutput?: string;
    };
  }> {
    let rawText = '';
    try {
      rawText = await this.provider.generateRaw(prompt, systemPrompt);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Unknown provider failure';

      if (errorMsg.includes('MISSING_API_KEY')) {
        return {
          success: false,
          error: { code: 'MISSING_API_KEY', message: 'AI API credentials are not configured.' }
        };
      }
      if (errorMsg.includes('API_TIMEOUT')) {
        return {
          success: false,
          error: { code: 'API_TIMEOUT', message: 'The AI service timed out while processing the request.' }
        };
      }
      if (errorMsg.includes('RATE_LIMITED')) {
        return {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'AI rate limit reached. Please try again shortly.' }
        };
      }
      return {
        success: false,
        error: { code: 'API_UNAVAILABLE', message: 'The AI model service is currently unavailable.' }
      };
    }

    // Parse JSON safely
    let parsedJson: unknown;
    try {
      // Clean accidental markdown wrappers like ```json ... ```
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      return {
        success: false,
        error: {
          code: 'MALFORMED_OUTPUT',
          message: 'Failed to parse model response as valid JSON.',
          rawOutput: rawText
        }
      };
    }

    // Validate with Zod schema
    const validation = schema.safeParse(parsedJson);
    if (!validation.success) {
      return {
        success: false,
        error: {
          code: 'SCHEMA_VALIDATION_FAILED',
          message: `Model output did not match expected schema: ${validation.error.issues.map(i => i.message).join(', ')}`,
          rawOutput: rawText
        }
      };
    }

    return {
      success: true,
      data: validation.data
    };
  }

  /**
   * Generates raw string output directly from underlying provider.
   */
  async generateRaw(prompt: string, systemPrompt: string): Promise<string> {
    return this.provider.generateRaw(prompt, systemPrompt);
  }
}
