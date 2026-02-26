import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from '../theme/theme';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { PullRequestsPage } from '../pages/PullRequestsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'pull-requests', element: <PullRequestsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

function renderAt(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = new QueryClient();
  render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('router', () => {
  it('renders DashboardPage with "Overview" heading at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });

  it('renders PullRequestsPage heading at /pull-requests', () => {
    renderAt('/pull-requests');
    expect(screen.getByRole('heading', { name: 'Pull Requests' })).toBeInTheDocument();
  });

  it('renders NotFoundPage at an unknown path', () => {
    renderAt('/nonexistent');
    expect(screen.getByRole('heading', { name: '404 — Page Not Found' })).toBeInTheDocument();
  });
});
