import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { PullRequestsPage } from '../pages/PullRequestsPage';
import { CommitsPage } from '../pages/CommitsPage';
import { ContributorsPage } from '../pages/ContributorsPage';
import { RepositoriesPage } from '../pages/RepositoriesPage';
import { TeamsPage } from '../pages/TeamsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'pull-requests', element: <PullRequestsPage /> },
      { path: 'commits', element: <CommitsPage /> },
      { path: 'contributors', element: <ContributorsPage /> },
      { path: 'repositories', element: <RepositoriesPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
