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

    // Test verb scraping with enhanced principal parts and conjugation tables
    const verbs = VocabularyParserService.filterVerbs(parseResult);

    // Take first 3 verbs for testing (fewer because scraping takes longer)
    const testVerbs = verbs.slice(0, 3);

    // Scrape the test verbs to get conjugation data
    const scrapedResults = await WiktionaryScraperService.scrapeWords(testVerbs);

    const totalDuration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: 'Verb scraping test completed (enhanced principal parts + conjugation tables)',
      timestamp: new Date().toISOString(),
      performance: {
        totalDurationMs: totalDuration,
        totalDurationSeconds: +(totalDuration / 1000).toFixed(1),
        averageTimePerWordMs: +(totalDuration / scrapedResults.length).toFixed(1),
        wordsPerSecond: +(scrapedResults.length / (totalDuration / 1000)).toFixed(1),
      },
      stats: {
        totalParsedEntries: parseResult.totalEntries,
        verbsFound: verbs.length,
        verbsScraped: scrapedResults.length,
        successfulScrapes: scrapedResults.filter(r => r.wiktionaryData !== null).length,
        failedScrapes: scrapedResults.filter(r => r.wiktionaryData === null).length,
        deponentFromWiktionary: scrapedResults.filter(r => r.wiktionaryData?.isDeponent).length,
      },
      verbs: scrapedResults.map(result => ({
        // Parsed data
        id: result.parsedData.id,
        wordForm: result.parsedData.wordForm,
        alternateForm: result.parsedData.alternateForm,
        grammaticalInfo: result.parsedData.grammaticalInfo,
        principalParts: result.parsedData.principalParts,
        translation: result.parsedData.translation,
        conjugationClass: result.parsedData.conjugationClass,
        section: result.parsedData.section,
        subsection: result.parsedData.subsection,
        originalText: result.parsedData.originalText,
        // Wiktionary data
        etymology: result.wiktionaryData?.etymology,
        pronunciation: result.wiktionaryData?.pronunciation,
        conjugation: result.wiktionaryData?.conjugation,
        isDeponent: result.wiktionaryData?.isDeponent,
        definitions: result.wiktionaryData?.definitions,
        conjugationTable: result.wiktionaryData?.conjugationTable,
        hasWiktionaryData: result.wiktionaryData !== null,
        scrapingError: result.error,
      })),
    });
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
    principalParts: parsedData.principalParts,
    originalText: parsedData.originalText,

    scrapingError: scrapedResult.error,
    hasWiktionaryData: wiktionaryData !== null,
  };
}
