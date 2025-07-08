import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest): Promise<NextResponse> {
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
      words.slice(0, 3).forEach((word: any, index: number) => {
        console.log(`  ${index + 1}. ${word.word} (${word.wordType}) - ${word.translation?.substring(0, 50)}...`);
      });
    }

    console.log('Step 3: Analyzing word types...');
    const wordTypeBreakdown = {
      nouns: words.filter((word: any) => word.wordType === 'noun').length,
      verbs: words.filter((word: any) => word.wordType === 'verb').length,
      adjectives: words.filter((word: any) => word.wordType === 'adjective').length,
      other: words.filter((word: any) => !['noun', 'verb', 'adjective'].includes(word.wordType)).length,
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

async function loadFinalJsonFile(): Promise<any> {
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

async function uploadWordsToFirebase(words: any[]): Promise<{ batchesCreated: number; uploadDuration: number }> {
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
