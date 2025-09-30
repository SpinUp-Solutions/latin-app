import React from 'react';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Library } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PoolNotFoundPageProps {
  poolId: string;
  backHref?: string;
  backLabel?: string;
  error?: string;
}

export const PoolNotFoundPage: React.FC<PoolNotFoundPageProps> = ({ 
  poolId, 
  backHref = '/admin/vocabulary-pools', 
  backLabel = 'Back to Vocabulary Pools',
  error
}) => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Pool Not Found</h1>
            </div>
          </div>
        </div>
      </header>
      <div className="container mx-auto py-6 px-4 text-center">
        <p className="text-red-600 mb-4">{error || 'Pool not found'}</p>
        <Button onClick={() => router.push('/admin/vocabulary-pools')}>Back to Pools</Button>
      </div>
    </div>
  );
};