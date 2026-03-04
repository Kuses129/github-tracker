import { render, screen } from '@testing-library/react';
import { CycleTimeCell } from './CycleTimeCell';

describe('CycleTimeCell', () => {
  it('formats 172800 seconds as "2d 0h"', () => {
    render(<CycleTimeCell totalSeconds={172800} />);
    expect(screen.getByText('2d 0h')).toBeInTheDocument();
  });

  it('formats 3600 seconds as "1h 0m"', () => {
    render(<CycleTimeCell totalSeconds={3600} />);
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
  });

  it('formats 0 seconds as "0m"', () => {
    render(<CycleTimeCell totalSeconds={0} />);
    expect(screen.getByText('0m')).toBeInTheDocument();
  });

  it('renders dash when totalSeconds is null', () => {
    render(<CycleTimeCell totalSeconds={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
