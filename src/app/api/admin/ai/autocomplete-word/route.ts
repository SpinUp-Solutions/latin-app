import { NextRequest, NextResponse } from 'next/server';
import { autocompleteVocabularyWord } from '@/src/lib/openai/autocomplete';
import { AIAutocompleteRequest } from '@/src/lib/openai/types';
import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[AI Autocomplete API] Request received');

  try {
    const body = await request.json();
    console.log('[AI Autocomplete API] Request body:', JSON.stringify(body, null, 2));

    const { word, part_of_speech, existingData, fieldsToComplete, overwriteExisting } = body;

    if (!word || typeof word !== 'string') {
      console.error('[AI Autocomplete API] Validation error: Word is required or invalid');
      return NextResponse.json({ success: false, error: 'Word is required' }, { status: 400 });
    }

    if (!part_of_speech || typeof part_of_speech !== 'string') {
      console.error('[AI Autocomplete API] Validation error: Part of speech is required or invalid');
      return NextResponse.json({ success: false, error: 'Part of speech is required' }, { status: 400 });
    }

    console.log(`[AI Autocomplete API] Processing: word="${word}", part_of_speech="${part_of_speech}"`);

    const autocompleteRequest: AIAutocompleteRequest = {
      word,
      part_of_speech: part_of_speech as PartOfSpeech,
      existingData,
      fieldsToComplete,
      overwriteExisting: overwriteExisting ?? false,
    };

    console.log('[AI Autocomplete API] Calling autocompleteVocabularyWord...');
    const result = await autocompleteVocabularyWord(autocompleteRequest);
    console.log('[AI Autocomplete API] Result received:', {
      success: result.success,
      error: result.error,
      hasData: !!result.data,
      tokensUsed: result.tokensUsed,
      cost: result.cost?.totalCost,
    });

    if (!result.success) {
      console.error('[AI Autocomplete API] Autocomplete failed:', result.error);
      return NextResponse.json(result, { status: 500 });
    }

    console.log('[AI Autocomplete API] Success! Returning result');
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[AI Autocomplete API] Unexpected error:', error);
    console.error('[AI Autocomplete API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = {
      message: errorMessage,
      type: error?.constructor?.name || typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    };

    console.error('[AI Autocomplete API] Error details:', JSON.stringify(errorDetails, null, 2));

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        errorDetails,
      },
      { status: 500 }
    );
  }
}
