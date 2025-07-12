import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

interface WordData {
  word: string;
  wordType: string;
  translation: string;
  [key: string]: unknown;
}

interface FileData {
  words: WordData[];
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const section = searchParams.get('section');
    const limit = parseInt(searchParams.get('limit') || '20'); // Reduced default limit
    const lastWordId = searchParams.get('lastWordId'); // For cursor-based pagination
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';

    console.log('Fetching words with filters:', { wordType, section, limit, lastWordId, search, countsOnly });

    // If only requesting counts, return just the statistics
    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts();
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    let query: Query = adminDb.collection('words').orderBy('word');

    // Apply filters
    if (wordType) {
      query = query.where('wordType', '==', wordType);
    }

    if (section) {
      query = query.where('section', '==', section);
    }

    // Apply search if provided
    if (search) {
      query = query.where('word', '>=', search).where('word', '<=', search + '\uf8ff');
    }

    // Apply cursor-based pagination
    if (lastWordId) {
      const lastDocSnapshot = await adminDb.collection('words').doc(lastWordId).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }

    // Apply limit
    query = query.limit(limit);

    const snapshot = await query.get();

    const words = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Check if there are more documents
    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit,
        filters: { wordType, section, search },
      },
    });
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<NextResponse> {
  const startTime = Date.now();
  console.log('=== FIREBASE UPLOAD PROCESS STARTED ===');
  console.log(`Start time: ${new Date().toISOString()}`);

  try {
    console.log('Step 1: Testing database connection...');
    await testDatabaseConnection();
    console.log('✓ Database connection successful');

    console.log('Step 2: Loading final.json file...');
    const wordsData = await loadFinalJsonFile();
    if (!wordsData) {
      console.log('✗ final.json file not found');
      return NextResponse.json(
        {
          success: false,
          error: 'final.json file not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const words = wordsData.words || [];
    console.log(`✓ Loaded ${words.length} words from final.json`);

    // Debug: Show sample words
    if (words.length > 0) {
      console.log('Sample words structure:');
      words.slice(0, 3).forEach((word: WordData, index: number) => {
        console.log(`  ${index + 1}. ${word.word} (${word.wordType}) - ${word.translation?.substring(0, 50)}...`);
      });
    }

    console.log('Step 3: Analyzing word types...');
    const wordTypeBreakdown = {
      nouns: words.filter((word: WordData) => word.wordType === 'noun').length,
      verbs: words.filter((word: WordData) => word.wordType === 'verb').length,
      adjectives: words.filter((word: WordData) => word.wordType === 'adjective').length,
      other: words.filter((word: WordData) => !['noun', 'verb', 'adjective'].includes(word.wordType)).length,
    };

    console.log('✓ Word type breakdown:', wordTypeBreakdown);

    console.log('Step 4: Checking existing collection...');
    const existingWordsSnapshot = await adminDb.collection('words').limit(1).get();
    const collectionExists = !existingWordsSnapshot.empty;

    if (collectionExists) {
      console.log('⚠️  Warning: "words" collection already contains data');

      // Get count of existing documents
      const countSnapshot = await adminDb.collection('words').count().get();
      const existingCount = countSnapshot.data().count;
      console.log(`   Existing documents in collection: ${existingCount}`);
    } else {
      console.log('✓ Collection is empty, ready for upload');
    }

    console.log('Step 5: Starting Firebase batch upload...');
    const uploadResult = await uploadWordsToFirebase(words);

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    console.log('=== UPLOAD PROCESS COMPLETED SUCCESSFULLY ===');
    console.log(`✓ Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log(`✓ Upload rate: ${(words.length / (totalDuration / 1000)).toFixed(1)} words/second`);
    console.log(`End time: ${new Date().toISOString()}`);

    const responseData = {
      success: true,
      message: 'Words uploaded to Firebase successfully',
      timestamp: new Date().toISOString(),
      results: {
        totalWords: words.length,
        wordTypeBreakdown,
        batchesCreated: uploadResult.batchesCreated,
        collectionExisted: collectionExists,
        uploadDuration: uploadResult.uploadDuration,
      },
      performance: {
        totalDurationMs: totalDuration,
        totalDurationSeconds: +(totalDuration / 1000).toFixed(1),
        averageTimePerWordMs: +(totalDuration / words.length).toFixed(1),
        wordsPerSecond: +(words.length / (totalDuration / 1000)).toFixed(1),
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('=== UPLOAD PROCESS FAILED ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { wordId, updates } = await request.json();

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    console.log('Updating word:', wordId);
    console.log('Updates data:', JSON.stringify(updates, null, 2));

    // Add updatedAt timestamp
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Update the word document
    await adminDb.collection('words').doc(wordId).update(updateData);

    console.log(`Word ${wordId} updated successfully`);

    // Fetch the updated document to verify changes
    const updatedDoc = await adminDb.collection('words').doc(wordId).get();
    const updatedData = updatedDoc.data();
    console.log('Updated document data:', JSON.stringify(updatedData, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData: updatedData,
    });
  } catch (error) {
    console.error('Error updating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

// More efficient word type counts using aggregation
async function getWordTypeCounts() {
  try {
    // Use a cached approach or sample-based counting for better performance
    const snapshot = await adminDb.collection('words').limit(1000).get(); // Sample approach

    const counts = {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      enclitic: 0,
      number: 0,
      other: 0,
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const wordType = data.wordType as string;
      if (counts.hasOwnProperty(wordType)) {
        counts[wordType as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    });

    // Scale up the counts based on sample size (rough approximation)
    const sampleSize = snapshot.docs.length;
    const scaleFactor = sampleSize < 1000 ? 1 : Math.ceil(sampleSize / 1000);

    Object.keys(counts).forEach(key => {
      counts[key as keyof typeof counts] *= scaleFactor;
    });

    return counts;
  } catch (error) {
    console.error('Error getting word type counts:', error);
    return {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      enclitic: 0,
      number: 0,
      other: 0,
    };
  }
}

async function loadFinalJsonFile(): Promise<FileData | null> {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    const filePath = path.join(publicDir, 'final2.json');

    console.log(`  Checking file path: ${filePath}`);

    // Check if file exists
    const fileExists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);

    if (!fileExists) {
      console.log('  ✗ final.json file not found');

      // List available files for debugging
      try {
        const files = await fs.promises.readdir(publicDir);
        console.log('  Available files in public directory:');
        files.forEach(file => console.log(`    - ${file}`));
      } catch (dirError) {
        console.log('  Could not read public directory');
      }

      return null;
    }

    console.log('  ✓ File exists, reading content...');

    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(fileContent);

    console.log(`  ✓ File parsed successfully`);
    console.log(`  File size: ${fileContent.length} characters`);
    console.log(`  Data structure: ${typeof parsedData}`);

    if (parsedData.words) {
      console.log(`  Words array length: ${parsedData.words.length}`);
    } else {
      console.log('  ⚠️  No "words" property found in JSON');
    }

    return parsedData;
  } catch (error) {
    console.error('  ✗ Error loading final.json:', error);
    return null;
  }
}

async function uploadWordsToFirebase(words: WordData[]): Promise<{ batchesCreated: number; uploadDuration: number }> {
  const BATCH_SIZE = 500; // Firebase batch limit
  const uploadStartTime = Date.now();

  try {
    console.log(`  Starting batch upload of ${words.length} words to Firebase...`);
    console.log(`  Batch size: ${BATCH_SIZE} words per batch`);

    const batches = [];
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const batchWords = words.slice(i, i + BATCH_SIZE);

      console.log(
        `  Creating batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchWords.length} words (${i + 1}-${i + batchWords.length})`
      );

      batchWords.forEach((word, index) => {
        const docRef = adminDb.collection('words').doc(); // Auto-generate ID
        batch.set(docRef, {
          ...word,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Debug first few words in first batch
        if (i === 0 && index < 2) {
          console.log(`    Sample word ${index + 1}: ${word.word} (${word.wordType})`);
        }
      });

      batches.push(batch);
    }

    console.log(`  ✓ Created ${batches.length} batches for upload`);

    // Execute all batches
    for (let i = 0; i < batches.length; i++) {
      const batchStartTime = Date.now();

      try {
        await batches[i].commit();
        const batchDuration = Date.now() - batchStartTime;
        console.log(`  ✓ Batch ${i + 1}/${batches.length} uploaded successfully (${batchDuration}ms)`);
      } catch (batchError) {
        console.error(`  ✗ Batch ${i + 1}/${batches.length} failed:`, batchError);
        throw batchError;
      }

      // Small delay between batches to avoid rate limits
      if (i < batches.length - 1) {
        console.log(`  Waiting 100ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const uploadEndTime = Date.now();
    const uploadDuration = uploadEndTime - uploadStartTime;

    console.log(`  ✓ All ${words.length} words uploaded to Firebase successfully`);
    console.log(`  Upload duration: ${uploadDuration}ms (${(uploadDuration / 1000).toFixed(1)}s)`);
    console.log(`  Average per batch: ${(uploadDuration / batches.length).toFixed(1)}ms`);

    return {
      batchesCreated: batches.length,
      uploadDuration,
    };
  } catch (error) {
    console.error('  ✗ Error uploading words to Firebase:', error);
    throw error;
  }
}

async function testDatabaseConnection(): Promise<void> {
  try {
    await adminDb.collection('_test').doc('connection').get();
  } catch (error) {
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
