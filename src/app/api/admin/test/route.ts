import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

import { ApiResponse, ScrapedResult, WordResponse } from '@/src/types/vocabulary';
import { VocabularyParserService } from '@/src/services/vocabularyParserService';
import { WiktionaryScraperService } from '@/src/services/wiktionaryScraperService';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    await testDatabaseConnection();

    const parseResult = await VocabularyParserService.parseVocabularyFile();

    // Scrape third declension nouns specifically (you can change this to any declension)
    const scrapedResults = await WiktionaryScraperService.scrapeThirdDeclensionNouns(parseResult);

    const totalDuration = Date.now() - startTime;
    const performance = calculatePerformanceMetrics(scrapedResults, totalDuration);

    const failedResults = scrapedResults.filter(r => r.wiktionaryData === null);

    return NextResponse.json({
      success: true,
      message: 'Parser + Scraper test completed (3rd declension nouns)',
      timestamp: new Date().toISOString(),
      performance,
      stats: {
        totalParsedEntries: parseResult.totalEntries,
        firstDeclensionNounsFound: VocabularyParserService.filterFirstDeclensionNouns(parseResult).length,
        secondDeclensionNounsFound: VocabularyParserService.filterSecondDeclensionNouns(parseResult).length,
        thirdDeclensionNounsFound: VocabularyParserService.filterThirdDeclensionNouns(parseResult).length,
        fourthDeclensionNounsFound: VocabularyParserService.filterFourthDeclensionNouns(parseResult).length,
        fifthDeclensionNounsFound: VocabularyParserService.filterFifthDeclensionNouns(parseResult).length,
        scraped: scrapedResults.length,
        successful: scrapedResults.filter(r => r.wiktionaryData !== null).length,
        failed: failedResults.length,
      },
      words: scrapedResults.map(formatWordForResponse),
      failedWords: failedResults.map(result => ({
        word: result.parsedData.wordForm,
        grammaticalInfo: result.parsedData.grammaticalInfo,
        translation: result.parsedData.translation,
        error: result.error || 'No Wiktionary data found',
        originalText: result.parsedData.originalText,
      })),
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
  const totalSeconds = totalDuration / 1000;

  return {
    totalDurationMs: totalDuration,
    totalDurationSeconds: +totalSeconds.toFixed(1),
    averageTimePerWordMs: +(totalDuration / results.length).toFixed(1),
    wordsPerSecond: +(results.length / totalSeconds).toFixed(1),
  };
}

function formatWordForResponse(scrapedResult: ScrapedResult): WordResponse {
  const { parsedData, wiktionaryData } = scrapedResult;

  // Helper function to map declension class from string to number (e.g., "1st" -> 1)
  const mapDeclensionClass = (declensionClass?: string): number | undefined => {
    if (!declensionClass) return undefined;
    const match = declensionClass.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  };

  return {
    // Core word data
    word: parsedData.wordForm,
    alternateForm: parsedData.alternateForm,
    grammaticalInfo: parsedData.grammaticalInfo,
    gender: parsedData.gender || wiktionaryData?.gender,
    translation: parsedData.translation,
    type: parsedData.wordType,
    declensionClass: mapDeclensionClass(parsedData.declensionClass),

    etymology: wiktionaryData?.etymology,
    pronunciation: wiktionaryData?.pronunciation,
    declensionTable: wiktionaryData?.declensionTable,
    definitions: wiktionaryData?.definitions,
    partOfSpeech: parsedData.wordType,
    declension: wiktionaryData?.declension,

    id: parsedData.id,
    section: parsedData.section,
    subsection: parsedData.subsection,
    conjugationClass: parsedData.conjugationClass,
    isDeponent: parsedData.isDeponent,
    originalText: parsedData.originalText,

    scrapingError: scrapedResult.error,
    hasWiktionaryData: wiktionaryData !== null,
  };
}
