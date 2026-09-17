import { NextRequest, NextResponse } from 'next/server';
import { BookingState, ChatApiRequest, ChatApiResponse } from '@/types/booking';
import { processUserTurn } from '@/lib/conversation/conversationManager';
import { createInitialBookingState } from '@/lib/state/stateMachine';

import { LLMClient, MockLLMProvider } from '@/lib/ai/llmClient';
import { parseLocalDelta } from '@/lib/ai/localExtractor';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body: ChatApiRequest = await req.json();
    const { sessionId, message, currentState, history = [] } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 }
      );
    }

    const state: BookingState = currentState || createInitialBookingState(sessionId || 'default-session');

    // If running in development without external keys, use local deterministic fallback extractor
    let customClient: LLMClient | undefined;
    if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      customClient = new LLMClient(new MockLLMProvider(() => {
        const delta = parseLocalDelta(message);
        return JSON.stringify(delta);
      }));
    }

    // Run Step 4 Conversation Manager Orchestration Pipeline
    const result = await processUserTurn(
      {
        userUtterance: message,
        currentState: state,
        conversationHistory: history,
        sessionId: sessionId || 'default-session'
      },
      customClient
    );

    const isReview =
      result.action.type === 'PRESENT_REQUIREMENTS_REVIEW' ||
      result.action.type === 'REQUEST_CONFIRMATION' ||
      result.updatedState.phase === 'REQUIREMENTS_REVIEW';

    const responsePayload: ChatApiResponse = {
      reply: result.responseText,
      updatedState: result.updatedState,
      phase: result.updatedState.phase,
      shouldSpeak: result.shouldSpeak,
      actionRequired: isReview
        ? 'CONFIRMATION'
        : (result.action.type === 'ASK_FOR_CLARIFICATION' ? 'CLARIFICATION' : 'NONE'),
      action: result.action,
      diagnostics: {
        extractorDelta: {
          userIntent: result.updatedState.phase === 'BOOKING_CONFIRMED' ? 'CONFIRMATION' : 'PROVIDE_INFORMATION'
        },
        processingTimeMs: Date.now() - startTime,
        modelUsed: result.metadata?.modelUsed || 'conversation-manager'
      }
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Chat API error:', err);
    return NextResponse.json(
      {
        error: 'Failed to process voice turn',
        details: err?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
