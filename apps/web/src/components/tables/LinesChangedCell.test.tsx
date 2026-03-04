import { render, screen } from '@testing-library/react';
import { LinesChangedCell } from './LinesChangedCell';

describe('LinesChangedCell', () => {
  it('renders additions and deletions with correct signs', () => {
    render(<LinesChangedCell additions={50} deletions={20} />);
    expect(screen.getByText('+50')).toBeInTheDocument();
    expect(screen.getByText('-20')).toBeInTheDocument();
  });

  it('renders zero additions and zero deletions', () => {
    render(<LinesChangedCell additions={0} deletions={0} />);
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByText('-0')).toBeInTheDocument();
  });
});
