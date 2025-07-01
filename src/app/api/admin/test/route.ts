import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

import { ApiResponse, ParsedEntry, ScrapedResult } from '@/src/types/vocabulary';
import { VocabularyParserService } from '@/src/services/vocabularyParserService';
import { WiktionaryScraperService } from '@/src/services/wiktionaryScraperService';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    await testDatabaseConnection();

    const parseResult = await VocabularyParserService.parseVocabularyFile();

    // Scrape first declension nouns specifically
    const scrapedResults = await WiktionaryScraperService.scrapeFirstDeclensionNouns(parseResult);
    const firstDeclensionNouns = VocabularyParserService.filterFirstDeclensionNouns(parseResult);

    const totalDuration = Date.now() - startTime;
    const performance = calculatePerformanceMetrics(scrapedResults, totalDuration);

    return NextResponse.json({
      success: true,
      message: 'Parser + Scraper test completed',
      timestamp: new Date().toISOString(),
      performance,
      stats: {
        totalParsedEntries: parseResult.totalEntries,
        firstDeclensionNounsFound: firstDeclensionNouns.length,
        scraped: scrapedResults.length,
        successful: scrapedResults.filter(r => r.wiktionaryData !== null).length,
        failed: scrapedResults.filter(r => r.wiktionaryData === null).length,
      },
      firstDeclensionNouns: firstDeclensionNouns.slice(0, 10).map(formatEntryForResponse),
      scrapedResults,
    } as ApiResponse);
  } catch (error) {
    console.error('Parser + Scraper test failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Parser + Scraper test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function testDatabaseConnection(): Promise<void> {
  try {
    await adminDb.collection('_test').doc('connection').get();
  } catch (error) {
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function calculatePerformanceMetrics(results: ScrapedResult[], totalDuration: number) {
  const avgTimePerWord = totalDuration / results.length;

  return {
    totalDurationMs: totalDuration,
    totalDurationSeconds: +(totalDuration / 1000).toFixed(1),
    averageTimePerWordMs: +avgTimePerWord.toFixed(1),
    wordsPerSecond: +(results.length / (totalDuration / 1000)).toFixed(1),
  };
}

function formatEntryForResponse(entry: ParsedEntry) {
  return {
    id: entry.id,
    wordForm: entry.wordForm,
    grammaticalInfo: entry.grammaticalInfo,
    translation: entry.translation,
    gender: entry.gender,
  };
}
