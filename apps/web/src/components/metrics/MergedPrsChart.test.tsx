import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MergedPrsChart } from './MergedPrsChart';

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('MergedPrsChart', () => {
  it('renders Skeleton when isLoading is true', () => {
    const { container } = renderWithTheme(
      <MergedPrsChart data={[]} isLoading={true} />,
    );
    const skeleton = container.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders empty state message when data is empty', () => {
    renderWithTheme(<MergedPrsChart data={[]} isLoading={false} />);
    expect(screen.getByText('No merge data for this period')).toBeInTheDocument();
  });

  it('renders chart content when data is provided', () => {
    renderWithTheme(
      <MergedPrsChart
        data={[{ period: '2026-01-01', count: 5 }]}
        isLoading={false}
      />,
    );
    expect(screen.queryByText('No merge data for this period')).not.toBeInTheDocument();
  });
});
