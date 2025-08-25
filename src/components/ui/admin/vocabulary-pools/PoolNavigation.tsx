import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home, Library } from 'lucide-react';

interface PoolNavigationProps {
  currentPage: 'list' | 'create' | 'detail' | 'edit' | 'words' | 'add-words';
  poolId?: string;
  poolName?: string;
}

export const PoolNavigation: React.FC<PoolNavigationProps> = ({
  currentPage,
  poolId,
  poolName
}) => {
  const breadcrumbs = [
    { label: 'Admin', href: '/admin', icon: Home },
    { label: 'Vocabulary Pools', href: '/admin/vocabulary-pools', icon: Library },
  ];

  if (poolId && poolName) {
    breadcrumbs.push({
      label: poolName,
      href: `/admin/vocabulary-pools/${poolId}`,
    });
  }

  if (currentPage === 'create') {
    breadcrumbs.push({ label: 'Create Pool' });
  } else if (currentPage === 'edit' && poolId) {
    breadcrumbs.push({ label: 'Edit Pool' });
  } else if (currentPage === 'words' && poolId) {
    breadcrumbs.push({ label: 'Words' });
  } else if (currentPage === 'add-words' && poolId) {
    breadcrumbs.push({ label: 'Words' });
    breadcrumbs.push({ label: 'Add Words' });
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-gray-500">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={index}>
          <div className="flex items-center gap-1">
            {crumb.icon && <crumb.icon className="h-4 w-4" />}
            {crumb.href ? (
              <Link 
                href={crumb.href}
                className="hover:text-roman-red transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-gray-900 font-medium">{crumb.label}</span>
            )}
          </div>
          {index < breadcrumbs.length - 1 && (
            <ChevronRight className="h-4 w-4" />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};