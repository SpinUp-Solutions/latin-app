import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import fs from 'fs';
import path from 'path';

import { ApiResponse, ScrapedResult, WordResponse } from '@/src/types/vocabulary';
import { VocabularyParserService } from '@/src/services/vocabularyParserService';
import { WiktionaryScraperService } from '@/src/services/wiktionaryScraperService';
import { WordFilters } from '@/src/services/core/word-filters';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    await testDatabaseConnection();

    const parseResult = await VocabularyParserService.parseVocabularyFile();
    console.log(`Parsed ${parseResult.totalEntries} total entries`);

    // Filter verbs by conjugation class
    const firstConjugationVerbs = VocabularyParserService.filterFirstConjugationVerbs(parseResult);
    const secondConjugationVerbs = VocabularyParserService.filterSecondConjugationVerbs(parseResult);
    const thirdConjugationVerbs = VocabularyParserService.filterThirdConjugationVerbs(parseResult);
    const fourthConjugationVerbs = VocabularyParserService.filterFourthConjugationVerbs(parseResult);

    // Validate parsing results against expected statistics
    const expectedStats: Record<string, number> = {
      '1st Conjugation': 111,
      '2nd Conjugation': 67,
      '3rd Conjugation': 215,
      '4th Conjugation': 19,
    };

    const actualStats: Record<string, number> = {
      '1st Conjugation': firstConjugationVerbs.length,
      '2nd Conjugation': secondConjugationVerbs.length,
      '3rd Conjugation': thirdConjugationVerbs.length,
      '4th Conjugation': fourthConjugationVerbs.length,
    };

    const statsMatch = Object.keys(expectedStats).every(key => expectedStats[key] === actualStats[key]);

    console.log(`Conjugation counts: ${JSON.stringify(actualStats)}`);
    if (!statsMatch) {
      console.warn('⚠️  Counts differ from expected:', expectedStats);
    } else {
      console.log('✅ Counts match expected statistics');
    }

    const wordsToScrape = [
      ...firstConjugationVerbs,
      ...secondConjugationVerbs,
      ...thirdConjugationVerbs,
      ...fourthConjugationVerbs,
    ];

    console.log(`Scraping ${wordsToScrape.length} verbs across all conjugations`);

    const scrapingResults = await WiktionaryScraperService.scrapeWords(wordsToScrape);

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Categorize results more accurately
    const successfulResults = scrapingResults.filter(r => !r.error && r.wiktionaryData !== null);
    const failedResults = scrapingResults.filter(r => r.error || r.wiktionaryData === null);

    // Separate different types of failures for better reporting
    const errorFailures = scrapingResults.filter(r => r.error);
    const wiktionaryFailures = scrapingResults.filter(r => !r.error && r.wiktionaryData === null);

    // Format words according to user requirements
    const formattedWords = successfulResults.map(formatWordForUserResponse);

    const responseData = {
      success: true,
      message: `Successfully scraped ${wordsToScrape.length} verbs (1st-4th conjugation)`,
      timestamp: new Date().toISOString(),
      statsValidation: {
        expectedStats,
        actualStats,
        statsMatch,
      },
      results: {
        totalScraped: scrapingResults.length,
        successful: successfulResults.length,
        failed: failedResults.length,
        failureBreakdown: {
          withErrors: errorFailures.length,
          wiktionaryFailed: wiktionaryFailures.length,
        },
        conjugationBreakdown: {
          '1st': firstConjugationVerbs.length,
          '2nd': secondConjugationVerbs.length,
          '3rd': thirdConjugationVerbs.length,
          '4th': fourthConjugationVerbs.length,
          total: wordsToScrape.length,
        },
        failedWords: [
          ...errorFailures.map(r => ({
            word: r.word,
            error: r.error,
            failureType: 'scraping_error',
          })),
          ...wiktionaryFailures.map(r => ({
            word: r.word,
            error: 'Failed to retrieve Wiktionary data',
            failureType: 'wiktionary_failed',
          })),
        ].slice(0, 20),
      },
      words: formattedWords,
      performance: {
        totalDurationMs: totalDuration,
        totalDurationSeconds: Math.round((totalDuration / 1000) * 100) / 100,
        averageTimePerWordMs: Math.round(totalDuration / wordsToScrape.length),
        wordsPerSecond: Math.round((wordsToScrape.length / (totalDuration / 1000)) * 100) / 100,
      },
    };

    // Commented out JSON file saving as requested
    // await saveResultsToFile(responseData, scrapingResults);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in test API:', error);
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

async function saveResultsToFile(responseData: any, rawScrapingResults: ScrapedResult[]): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `scraping-results-${timestamp}.json`;
    const filePath = path.join(process.cwd(), 'public', fileName);

    // Create comprehensive data to save
    const dataToSave = {
      metadata: {
        timestamp: responseData.timestamp,
        totalWords: responseData.results.totalScraped,
        successful: responseData.results.successful,
        failed: responseData.results.failed,
        performance: responseData.performance,
        conjugationBreakdown: responseData.results.conjugationBreakdown,
        failureBreakdown: responseData.results.failureBreakdown,
      },
      formattedWords: responseData.words,
      rawScrapingResults: rawScrapingResults,
      failedWords: responseData.results.failedWords,
    };

    await fs.promises.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log(`Results saved to: ${filePath}`);
    console.log(`File size: ${JSON.stringify(dataToSave).length} characters`);
  } catch (error) {
    console.error('Error saving results to file:', error);
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

function formatWordForUserResponse(scrapedResult: ScrapedResult) {
  const { parsedData, wiktionaryData } = scrapedResult;

  return {
    word: parsedData.wordForm,
    alternateForm: parsedData.alternateForm,
    grammaticalInfo: parsedData.grammaticalInfo,
    translation: parsedData.translation,
    wordType: parsedData.wordType,
    gender: parsedData.gender || wiktionaryData?.gender,
    declensionClass: parsedData.declensionClass,
    originalText: parsedData.originalText,
    wiktionaryDefinitions: wiktionaryData?.definitions || [],
    etymology: wiktionaryData?.etymology,
    pronounciation: wiktionaryData?.pronunciation,
    declensionTable: wiktionaryData?.declensionTable || [],
    conjugationTable: wiktionaryData?.conjugationTable,
    conjugationClass: parsedData.conjugationClass,
    conjugation: wiktionaryData?.conjugation,
    isDeponent: parsedData.isDeponent || wiktionaryData?.isDeponent,
    principalParts: parsedData.principalParts || [],
  };
}
