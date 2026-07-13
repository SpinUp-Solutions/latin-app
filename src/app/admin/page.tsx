'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { ArrowLeft, Shield, Plus, BookOpen, Globe, Filter, Clock, Database, Loader2, ClipboardList } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import { toast } from 'sonner';

type MigrationKey = 'poolTokens' | 'lessonSummaries';
type MigrationMode = 'dryRun' | 'run';
type MigrationResult = Record<string, unknown>;

function AdminPage() {
  const { makeAdminRequest } = useAdminApi();
  const [runningMigration, setRunningMigration] = useState<string | null>(null);
  const [migrationResults, setMigrationResults] = useState<Partial<Record<MigrationKey, MigrationResult>>>({});

  const runMigration = async (key: MigrationKey, mode: MigrationMode) => {
    const endpoints: Record<MigrationKey, string> = {
      poolTokens: 'vocabulary-pools/backfill-search-tokens',
      lessonSummaries: 'lessons/backfill-summaries',
    };
    const label = key === 'poolTokens' ? 'vocabulary search tokens' : 'lesson summaries';
    const isDryRun = mode === 'dryRun';

    if (!isDryRun && !confirm(`Run the ${label} migration now?`)) {
      return;
    }

    const runId = `${key}-${mode}`;
    setRunningMigration(runId);

    try {
      const response = await makeAdminRequest(`${endpoints[key]}${isDryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
      });
      setMigrationResults(prev => ({ ...prev, [key]: response.data }));
      toast.success(`${isDryRun ? 'Dry run completed' : 'Migration completed'}: ${label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Migration failed';
      toast.error(message);
    } finally {
      setRunningMigration(null);
    }
  };

  const renderMigrationResult = (key: MigrationKey) => {
    const result = migrationResults[key];
    if (!result) return null;

    return (
      <pre className="mt-3 max-h-32 overflow-auto rounded border bg-gray-50 p-3 text-xs text-gray-700">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <Image
              src="/assets/logos/wakeforest.png"
              alt="Wake Forest University"
              width={120}
              height={75}
              className="w-14 h-auto"
              priority
            />
            <div>
              <h1 className="text-xl font-serif tracking-wide">Admin Panel</h1>
              <p className="text-sm text-roman-stone">Latin Administration</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Lesson Management */}
          <RomanCard className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Lesson Management</h3>
                  <p className="text-sm text-roman-stone">Create and edit lessons</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/lessons/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Lesson
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/lessons/manage">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Manage Existing Lessons
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/lessons/live">
                    <Globe className="h-4 w-4 mr-2" />
                    Manage Live Lessons
                  </Link>
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>

          {/* Vocabulary Management */}
          <RomanCard className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Vocabulary Management</h3>
                  <p className="text-sm text-roman-stone">View and edit Latin words</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/vocabulary">
                    <BookOpen className="h-4 w-4 mr-2" />
                    View All Words
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/vocabulary/advanced">
                    <Filter className="h-4 w-4 mr-2" />
                    Advanced Filters
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/vocabulary/pending">
                    <Clock className="h-4 w-4 mr-2" />
                    Pending Review
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/admin/vocabulary-pools">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Vocabulary Pools
                  </Link>
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>

          {/* User Management */}
          <RomanCard className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">User Management</h3>
                  <p className="text-sm text-roman-stone">Manage users and roles</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button className="w-full justify-start" variant="outline" disabled>
                  View All Users
                </Button>
                <Button className="w-full justify-start" variant="outline" disabled>
                  Manage Roles
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>

          <RomanCard className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                  <ClipboardList className="h-6 w-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Diagramming Audit</h3>
                  <p className="text-sm text-roman-stone">Inspect student submissions and expected answers</p>
                </div>
              </div>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link href="/admin/diagramming-attempts">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  View Diagramming Attempts
                </Link>
              </Button>
            </RomanCardContent>
          </RomanCard>

          {/* Temporary Data Migrations */}
          <RomanCard className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Database className="h-6 w-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Data Migrations</h3>
                  <p className="text-sm text-roman-stone">Temporary backfill tools</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-800 mb-2">Vocabulary Search Tokens</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="justify-start"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('poolTokens', 'dryRun')}>
                      {runningMigration === 'poolTokens-dryRun' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Dry Run
                    </Button>
                    <Button
                      className="justify-start"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('poolTokens', 'run')}>
                      {runningMigration === 'poolTokens-run' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Run
                    </Button>
                  </div>
                  {renderMigrationResult('poolTokens')}
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-800 mb-2">Lesson Summaries</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="justify-start"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('lessonSummaries', 'dryRun')}>
                      {runningMigration === 'lessonSummaries-dryRun' && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Dry Run
                    </Button>
                    <Button
                      className="justify-start"
                      variant="outline"
                      disabled={runningMigration !== null}
                      onClick={() => runMigration('lessonSummaries', 'run')}>
                      {runningMigration === 'lessonSummaries-run' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Run
                    </Button>
                  </div>
                  {renderMigrationResult('lessonSummaries')}
                </div>
              </div>
            </RomanCardContent>
          </RomanCard>
        </div>

        {/* Quick Stats */}
      </main>
    </div>
  );
}

export default withAdminAuth(AdminPage);
