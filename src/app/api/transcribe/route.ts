import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (groqKey) {
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
        body: groqFormData
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ text: data.text });
      }
    }

    if (openaiKey) {
      const oaiFormData = new FormData();
      oaiFormData.append('file', audioFile, 'audio.webm');
      oaiFormData.append('model', 'whisper-1');
      oaiFormData.append('language', 'en');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`
        },
        body: oaiFormData
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ text: data.text });
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
    return NextResponse.json(
      { error: 'Transcription failed', details: error?.message },
      { status: 500 }
    );
  }
}
