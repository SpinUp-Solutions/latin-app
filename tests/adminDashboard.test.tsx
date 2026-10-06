import { render, screen } from '@testing-library/react';
import AdministrationPage from '@/src/app/admin/(shell)/page';

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));

describe('administration dashboard', () => {
  it('groups the available administration tools and omits the unfinished user-management card', () => {
    render(<AdministrationPage />);
    expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessment' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Vocabulary' })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Advanced Filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
    expect(screen.queryByText('Data Migrations')).not.toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create New Lesson' })).toHaveAttribute('href', '/admin/lessons/create');
  });
});
