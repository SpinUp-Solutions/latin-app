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

    // Get all adjectives
    const allAdjectives = VocabularyParserService.filterAdjectives(parseResult);

    console.log(`Found ${allAdjectives.length} adjectives`);

    // Analyze adjective sections
    const adjectiveSections = new Map<string, number>();
    const adjectiveSubsections = new Map<string, number>();

    allAdjectives.forEach(adj => {
      adjectiveSections.set(adj.section, (adjectiveSections.get(adj.section) || 0) + 1);
      if (adj.subsection) {
        adjectiveSubsections.set(adj.subsection, (adjectiveSubsections.get(adj.subsection) || 0) + 1);
      }
    });

    console.log('Adjectives by section:');
    Array.from(adjectiveSections.entries()).forEach(([section, count]) => {
      console.log(`  ${section}: ${count}`);
    });

    console.log('Adjectives by subsection:');
    Array.from(adjectiveSubsections.entries()).forEach(([subsection, count]) => {
      console.log(`  ${subsection}: ${count}`);
    });

    // Show sample adjectives for inspection
    console.log('\nSample adjectives:');
    allAdjectives.slice(0, 5).forEach(adj => {
      console.log(`  ${adj.wordForm} (${adj.grammaticalInfo}): ${adj.translation}`);
      console.log(`    Section: ${adj.section}, Subsection: ${adj.subsection || 'none'}`);
    });

    // Scrape adjectives with Wiktionary data
    console.log(`\nStarting scraping for ${allAdjectives.length} adjectives...`);
    const adjectiveScrapingResults = await WiktionaryScraperService.scrapeWords(allAdjectives, 40);

    const adjectiveSuccessCount = adjectiveScrapingResults.filter(result => result.wiktionaryData !== null).length;
    const adjectiveFailureCount = adjectiveScrapingResults.filter(result => result.wiktionaryData === null).length;

    console.log(`Adjective scraping completed. Success: ${adjectiveSuccessCount}, Failures: ${adjectiveFailureCount}`);

    // Analyze failures by section and subsection
    const failuresBySection = new Map<string, number>();
    const failuresBySubsection = new Map<string, number>();
    const failuresByErrorType = new Map<string, number>();

    adjectiveScrapingResults
      .filter(result => result.wiktionaryData === null)
      .forEach(result => {
        const section = result.parsedData.section;
        const subsection = result.parsedData.subsection || 'none';
        const errorType = result.error || 'Unknown error';

        failuresBySection.set(section, (failuresBySection.get(section) || 0) + 1);
        failuresBySubsection.set(subsection, (failuresBySubsection.get(subsection) || 0) + 1);
        failuresByErrorType.set(errorType, (failuresByErrorType.get(errorType) || 0) + 1);
      });

    console.log('\nFailure analysis:');
    console.log('Failures by section:');
    Array.from(failuresBySection.entries()).forEach(([section, count]) => {
      console.log(`  ${section}: ${count}`);
    });

    console.log('Failures by subsection:');
    Array.from(failuresBySubsection.entries()).forEach(([subsection, count]) => {
      console.log(`  ${subsection}: ${count}`);
    });

    console.log('Failures by error type:');
    Array.from(failuresByErrorType.entries()).forEach(([errorType, count]) => {
      console.log(`  ${errorType}: ${count}`);
    });

    // Format the adjective data for output
    const formattedAdjectives = adjectiveScrapingResults.map(result => formatAdjectiveForOutput(result));

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    const responseData = {
      success: true,
      message: 'Adjective scraping and analysis completed successfully',
      timestamp: new Date().toISOString(),
      results: {
        totalEntries: parseResult.totalEntries,
        totalAdjectives: allAdjectives.length,
        adjectivesSuccessfullyScraped: adjectiveSuccessCount,
        adjectivesFailed: adjectiveFailureCount,
        adjectiveBreakdown: {
          sections: Object.fromEntries(adjectiveSections),
          subsections: Object.fromEntries(adjectiveSubsections),
        },
        failedAdjectives: adjectiveScrapingResults
          .filter(result => result.wiktionaryData === null)
          .map(result => ({
            word: result.parsedData.wordForm,
            section: result.parsedData.section,
            subsection: result.parsedData.subsection,
            error: result.error || 'Failed to scrape data',
          })),
        failureAnalysis: {
          bySection: Object.fromEntries(failuresBySection),
          bySubsection: Object.fromEntries(failuresBySubsection),
          byErrorType: Object.fromEntries(failuresByErrorType),
        },
        successRate: {
          percentage: +((adjectiveSuccessCount / allAdjectives.length) * 100).toFixed(1),
          successCount: adjectiveSuccessCount,
          totalCount: allAdjectives.length,
        },
        sampleScrapedAdjectives: formattedAdjectives.slice(0, 10),
      },
      performance: {
        totalDurationMs: totalDuration,
        totalDurationSeconds: +(totalDuration / 1000).toFixed(1),
        averageTimePerAdjectiveMs: +(totalDuration / allAdjectives.length).toFixed(1),
        adjectivesPerSecond: +(allAdjectives.length / (totalDuration / 1000)).toFixed(1),
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in verb scraping API:', error);
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

function formatVerbForOutput(scrapedResult: ScrapedResult) {
  const { parsedData, wiktionaryData } = scrapedResult;

  return {
    word: parsedData.wordForm,
    alternateForm: parsedData.alternateForm || null,
    grammaticalInfo: parsedData.grammaticalInfo,
    translation: parsedData.translation,
    wordType: parsedData.wordType,
    conjugationClass: parsedData.conjugationClass || null,
    conjugation: wiktionaryData?.conjugation || null,
    isDeponent: parsedData.isDeponent || wiktionaryData?.isDeponent || false,
    principalParts: parsedData.principalParts || [],
    conjugationTable: wiktionaryData?.conjugationTable || null,
    definitions: wiktionaryData?.definitions || [],
    etymology: wiktionaryData?.etymology || null,
    pronunciation: wiktionaryData?.pronunciation || null,
    originalText: parsedData.originalText,
    section: parsedData.section,
  };
}

function formatAdjectiveForOutput(scrapedResult: ScrapedResult) {
  const { parsedData, wiktionaryData } = scrapedResult;

  return {
    word: parsedData.wordForm,
    alternateForm: parsedData.alternateForm || null,
    grammaticalInfo: parsedData.grammaticalInfo,
    translation: parsedData.translation,
    wordType: parsedData.wordType,
    declensionType: parsedData.declensionClass || null,
    declension: wiktionaryData?.declension || null,
    adjectiveDeclensionTable: wiktionaryData?.adjectiveDeclensionTable || null,
    definitions: wiktionaryData?.definitions || [],
    etymology: wiktionaryData?.etymology || null,
    pronunciation: wiktionaryData?.pronunciation || null,
    originalText: parsedData.originalText,
    section: parsedData.section,
    subsection: parsedData.subsection || null,
  };
}

function formatAdjectiveFromParsedData(parsedData: any) {
  return {
    word: parsedData.wordForm,
    alternateForm: parsedData.alternateForm || null,
    grammaticalInfo: parsedData.grammaticalInfo,
    translation: parsedData.translation,
    wordType: parsedData.wordType,
    declensionType: parsedData.declensionClass || null,
    declension: null, // Will be filled when scraped
    adjectiveDeclensionTable: null, // Will be filled when scraped
    definitions: [], // Will be filled when scraped
    etymology: null, // Will be filled when scraped
    pronunciation: null, // Will be filled when scraped
    originalText: parsedData.originalText,
    section: parsedData.section,
    subsection: parsedData.subsection || null,
  };
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
