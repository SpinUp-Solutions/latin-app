import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  console.log('=== FILE COMBINATION PROCESS STARTED ===');
  console.log(`Start time: ${new Date().toISOString()}`);

  try {
    console.log('Step 1: Testing database connection...');
    await testDatabaseConnection();
    console.log('✓ Database connection successful');

    console.log('Step 2: Loading latin-combined-words-2025-07-07 file...');
    const existingWordsData = await loadLatinCombinedWords();
    if (!existingWordsData) {
      return NextResponse.json(
        {
          success: false,
          error: 'latin-combined-words-2025-07-07 file not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const existingWords = existingWordsData.words || [];
    console.log(`✓ Loaded ${existingWords.length} existing words`);

    console.log('Step 3: Loading final.json file...');
    const finalData = await loadFinalJsonFile();
    if (!finalData) {
      return NextResponse.json(
        {
          success: false,
          error: 'final.json file not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const finalWords = finalData.words || [];
    console.log(`✓ Loaded ${finalWords.length} words from final.json`);

    console.log('Step 4: Analyzing word types...');
    const existingWordTypes = analyzeWordTypes(existingWords);
    const finalWordTypes = analyzeWordTypes(finalWords);

    console.log('Existing words breakdown:', existingWordTypes);
    console.log('Final.json words breakdown:', finalWordTypes);

    console.log('Step 5: Combining words...');
    const combinedWords = [...existingWords, ...finalWords];
    const combinedWordTypes = analyzeWordTypes(combinedWords);

    console.log(`✓ Combined ${combinedWords.length} total words`);
    console.log('Combined breakdown:', combinedWordTypes);

    console.log('Step 6: Creating new combined file...');
    const outputData = {
      words: combinedWords,
      metadata: {
        totalWords: combinedWords.length,
        wordTypes: combinedWordTypes,
        sources: {
          existingFile: {
            count: existingWords.length,
            wordTypes: existingWordTypes,
          },
          finalJson: {
            count: finalWords.length,
            wordTypes: finalWordTypes,
          },
        },
        createdAt: new Date().toISOString(),
        version: '2.0',
      },
    };

    const fileName = await saveCombinedFile(outputData);

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    console.log('=== FILE COMBINATION COMPLETED SUCCESSFULLY ===');
    console.log(`✓ Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log(`✓ New file created: ${fileName}`);
    console.log(`End time: ${new Date().toISOString()}`);

    const responseData = {
      success: true,
      message: 'Files combined successfully',
      timestamp: new Date().toISOString(),
      results: {
        newFileName: fileName,
        totalWords: combinedWords.length,
        existingWordsCount: existingWords.length,
        finalWordsCount: finalWords.length,
        wordTypeBreakdown: combinedWordTypes,
        sources: outputData.metadata.sources,
      },
      performance: {
        totalDurationMs: totalDuration,
        totalDurationSeconds: +(totalDuration / 1000).toFixed(1),
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('=== FILE COMBINATION FAILED ===');
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

async function loadLatinCombinedWords(): Promise<any> {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    const files = await fs.promises.readdir(publicDir);

    console.log(`  Checking public directory: ${publicDir}`);

    // Find the specific latin-combined-words file
    const combinedFile = files.find(file => file.startsWith('latin-combine') && file.endsWith('.json'));

    if (!combinedFile) {
      console.log('  ✗ latin-combined-words-2025-01-07 file not found');

      // List available files for debugging
      console.log('  Available files in public directory:');
      files.forEach(file => console.log(`    - ${file}`));

      return null;
    }

    console.log(`  ✓ Found file: ${combinedFile}`);

    const filePath = path.join(publicDir, combinedFile);
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(fileContent);

    console.log(`  ✓ File parsed successfully`);
    console.log(`  File size: ${fileContent.length} characters`);

    if (parsedData.words) {
      console.log(`  Words array length: ${parsedData.words.length}`);
    } else {
      console.log('  ⚠️  No "words" property found in JSON');
    }

    return parsedData;
  } catch (error) {
    console.error('  ✗ Error loading latin-combined-words file:', error);
    return null;
  }
}

async function loadFinalJsonFile(): Promise<any> {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    const filePath = path.join(publicDir, 'final.json');

    console.log(`  Checking file path: ${filePath}`);

    const fileExists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);

    if (!fileExists) {
      console.log('  ✗ final.json file not found');
      return null;
    }

    console.log('  ✓ File exists, reading content...');

    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(fileContent);

    console.log(`  ✓ File parsed successfully`);
    console.log(`  File size: ${fileContent.length} characters`);

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

function analyzeWordTypes(words: any[]): Record<string, number> {
  return {
    nouns: words.filter(word => word.wordType === 'noun').length,
    verbs: words.filter(word => word.wordType === 'verb').length,
    adjectives: words.filter(word => word.wordType === 'adjective').length,
    adverbs: words.filter(word => word.wordType === 'adverb').length,
    other: words.filter(word => !['noun', 'verb', 'adjective', 'adverb'].includes(word.wordType)).length,
  };
}

async function saveCombinedFile(data: any): Promise<string> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `latin-all-words-combined-${timestamp}.json`;
    const filePath = path.join(process.cwd(), 'public', fileName);

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`  ✓ Combined file saved: ${fileName}`);
    console.log(`  Total words in file: ${data.words.length}`);

    const { wordTypes } = data.metadata;
    console.log(
      `  Breakdown: ${wordTypes.nouns} nouns, ${wordTypes.verbs} verbs, ${wordTypes.adjectives} adjectives, ${wordTypes.adverbs} adverbs, ${wordTypes.other} other`
    );

    return fileName;
  } catch (error) {
    console.error('  ✗ Error saving combined file:', error);
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
