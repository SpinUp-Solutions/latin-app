import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { wordId: string } }): Promise<NextResponse> {
  try {
    const { wordId } = params;

    if (!wordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId is required',
        },
        { status: 400 }
      );
    }

    console.log('Fetching word:', wordId);

    const docSnapshot = await adminDb.collection('vocabulary_words').doc(wordId).get();

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Word not found',
        },
        { status: 404 }
      );
    }

    const word = {
      id: docSnapshot.id,
      ...docSnapshot.data(),
    };

    return NextResponse.json({
      success: true,
      data: {
        word,
      },
    });
  } catch (error) {
    console.error('Error fetching word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { wordId: string } }): Promise<NextResponse> {
  try {
    const { wordId } = params;

    if (!wordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId is required',
        },
        { status: 400 }
      );
    }

    console.log('Deleting word:', wordId);

    await adminDb.collection('vocabulary_words').doc(wordId).delete();

    console.log(`Word ${wordId} deleted successfully`);

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
