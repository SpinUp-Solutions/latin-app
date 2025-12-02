import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export async function DELETE(request: NextRequest, { params }: { params: { wordId: string } }): Promise<NextResponse> {
  try {
    const { wordId } = params;
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get('collection') || VOCABULARY_WORDS_COLLECTION;

    if (!wordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId is required',
        },
        { status: 400 }
      );
    }

    await adminDb.collection(collection).doc(wordId).delete();

    return NextResponse.json({
      success: true,
      message: 'Word deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
