import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data in request' }, { status: 400 });
    }

    const audioFile = formData.get('file') as Blob | null;

    if (!audioFile || !(audioFile instanceof Blob) || audioFile.size === 0) {
      return NextResponse.json({ error: 'No valid audio file provided' }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (groqKey) {
      try {
        const groqFormData = new FormData();
        groqFormData.append('file', audioFile, 'audio.webm');
        groqFormData.append('model', 'whisper-large-v3');
        groqFormData.append('language', 'en');
        groqFormData.append('temperature', '0.0');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`
          },
          body: groqFormData,
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ text: data.text });
        }
      } catch (groqErr) {
        console.warn('Groq transcription failed or timed out:', (groqErr as Error)?.message);
      }
    }

    if (openaiKey) {
      try {
        const oaiFormData = new FormData();
        oaiFormData.append('file', audioFile, 'audio.webm');
        oaiFormData.append('model', 'whisper-1');
        oaiFormData.append('language', 'en');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`
          },
          body: oaiFormData,
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ text: data.text });
        }
      } catch (oaiErr) {
        console.warn('OpenAI transcription failed or timed out:', (oaiErr as Error)?.message);
      }
    }

    return NextResponse.json(
      {
        error: 'No Whisper API key configured on server. Use client-side Web Speech API mode.'
      },
      { status: 501 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Transcription route error:', error?.message);
    return NextResponse.json(
      { error: 'Transcription failed. Please try again or use text input.' },
      { status: 500 }
    );
  }
}
