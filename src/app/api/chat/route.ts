import { NextRequest, NextResponse } from 'next/server';
import { BookingState, ChatApiRequest, ChatApiResponse } from '@/types/booking';
import { runExtractor, runSynthesizer } from '@/lib/ai/engine';
import { createInitialBookingState, reduceBookingState } from '@/lib/state/stateMachine';

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
    const turnIndex = (state.metadata.turnCount || 0) + 1;

    // 1. Pass 1: Extractor
    const { delta, modelUsed: extractorModel } = await runExtractor(message, state, history);

    // 2. Deterministic State Reducer
    const updatedState = reduceBookingState(state, delta, message, turnIndex);

    // 3. Pass 2: Conversational Synthesizer
    const { reply, modelUsed: synthesizerModel } = await runSynthesizer(message, updatedState, delta, history);
    updatedState.metadata.lastAgentResponse = reply;

    const responsePayload: ChatApiResponse = {
      reply,
      updatedState,
      phase: updatedState.phase,
      shouldSpeak: true,
      actionRequired: updatedState.phase === 'REQUIREMENTS_REVIEW' ? 'CONFIRMATION' : 'NONE',
      diagnostics: {
        extractorDelta: delta,
        processingTimeMs: Date.now() - startTime,
        modelUsed: `${extractorModel} + ${synthesizerModel}`
      }
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process voice turn',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
