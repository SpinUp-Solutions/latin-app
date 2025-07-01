import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

import { ApiResponse, ParsedEntry, ScrapedResult, WordResponse } from '@/src/types/vocabulary';
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
      words: scrapedResults.map(formatWordForResponse),
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

function formatWordForResponse(scrapedResult: ScrapedResult): WordResponse {
  const { parsedData, wiktionaryData } = scrapedResult;

  // Helper function to map declension class numbers
  const mapDeclensionClass = (declensionClass?: string): number | undefined => {
    if (!declensionClass) return undefined;
    const match = declensionClass.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  };

  return {
    word: parsedData.wordForm,
    grammaticalInfo: parsedData.grammaticalInfo,
    gender: parsedData.gender || wiktionaryData?.gender,
    translation: parsedData.translation,
    type: parsedData.wordType,
    declensionClass: mapDeclensionClass(parsedData.declensionClass),
    etymology: wiktionaryData?.etymology,
    pronunciation: wiktionaryData?.pronunciation,
    declensionTable: wiktionaryData?.declensionTable,
    conjugationTable: undefined, // Not implemented yet for verbs
    // Additional fields from parsed data
    id: parsedData.id,
    section: parsedData.section,
    subsection: parsedData.subsection,
    conjugationClass: parsedData.conjugationClass,
    isDeponent: parsedData.isDeponent,
    originalText: parsedData.originalText,
    // Wiktionary additional data
    definitions: wiktionaryData?.definitions,
    partOfSpeech: wiktionaryData?.partOfSpeech,
    declension: wiktionaryData?.declension,
    // Scraping metadata
    scrapingError: scrapedResult.error,
    hasWiktionaryData: wiktionaryData !== null,
  };
}
