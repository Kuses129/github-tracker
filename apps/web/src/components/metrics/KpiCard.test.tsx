import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders Skeleton when isLoading is true', () => {
    const { container } = render(
      <KpiCard title="PRs Merged" value={null} isLoading={true} />,
    );
    const skeleton = container.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders value and positive delta', () => {
    render(<KpiCard title="PRs Merged" value={42} delta={12} isLoading={false} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('renders value and negative delta', () => {
    render(<KpiCard title="PRs Merged" value={42} delta={-5} isLoading={false} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('-5%')).toBeInTheDocument();
  });

  it('does not render delta chip when delta is null', () => {
    render(<KpiCard title="PRs Merged" value={42} delta={null} isLoading={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
