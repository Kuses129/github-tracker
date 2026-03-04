import { render, screen } from '@testing-library/react';
import { PullRequestStatusChip } from './PullRequestStatusChip';

describe('PullRequestStatusChip', () => {
  it('renders chip with text "merged" for merged state', () => {
    render(<PullRequestStatusChip state="merged" />);
    expect(screen.getByText('merged')).toBeInTheDocument();
  });

  it('renders chip with text "open" for open state', () => {
    render(<PullRequestStatusChip state="open" />);
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('renders chip with text "closed" for closed state', () => {
    render(<PullRequestStatusChip state="closed" />);
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('renders chip with text "draft" for draft state', () => {
    render(<PullRequestStatusChip state="draft" />);
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});
