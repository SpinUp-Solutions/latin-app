import type { ReactNode } from 'react';
import Image from 'next/image';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';

export function AuthScreen({
  title,
  description,
  showLogo = false,
  footer,
  children,
}: {
  title: string;
  description: ReactNode;
  showLogo?: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/20 p-4">
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 blur-3xl -z-10 transform rotate-45"></div>
        <RomanCard className="shadow-xl">
          <RomanCardHeader className="space-y-1 text-center">
            {showLogo && (
              <Image
                src="/assets/logos/wakeforest.png"
                alt="Wake Forest University"
                width={160}
                height={100}
                className="w-32 h-auto mx-auto mb-2"
                priority
              />
            )}
            <h2 className="text-2xl font-bold font-serif">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </RomanCardHeader>
          <RomanCardContent>
            {children}
            <p className="mt-6 text-center text-sm text-muted-foreground w-full">{footer}</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    </div>
  );
}
