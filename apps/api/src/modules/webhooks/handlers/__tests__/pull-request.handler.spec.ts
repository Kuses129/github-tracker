import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrState } from '../../../../generated/prisma';
import { ContributorsService } from '../../../contributors/contributors.service';
import { OrganizationsService } from '../../../organizations/organizations.service';
import { PullRequestsService } from '../../../pull-requests/pull-requests.service';
import { RepositoriesService } from '../../../repositories/repositories.service';
import { mockOrg, mockRepo, repository } from '../../../../test/webhook.helpers';
import { PullRequestHandler } from '../pull-request.handler';

const mockAuthor = { id: 'author-uuid' };
const prUser = { id: 501, login: 'dev-jane' };

const basePullRequest = {
  id: 9001,
  number: 42,
  title: 'Add feature X',
  html_url: 'https://github.com/acme-org/backend/pull/42',
  state: 'open' as const,
  merged: null as boolean | null,
  additions: 120,
  deletions: 30,
  changed_files: 5,
  created_at: '2026-01-15T10:00:00Z',
  merged_at: null as string | null,
  user: prUser,
};

describe('PullRequestHandler', () => {
  let handler: PullRequestHandler;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let repositoriesService: jest.Mocked<RepositoriesService>;
  let contributorsService: jest.Mocked<ContributorsService>;
  let pullRequestsService: jest.Mocked<PullRequestsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PullRequestHandler,
        {
          provide: OrganizationsService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockOrg) },
        },
        {
          provide: RepositoriesService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockRepo) },
        },
        {
          provide: ContributorsService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockAuthor) },
        },
        {
          provide: PullRequestsService,
          useValue: { upsert: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    handler = module.get<PullRequestHandler>(PullRequestHandler);
    organizationsService = module.get(OrganizationsService);
    repositoriesService = module.get(RepositoriesService);
    contributorsService = module.get(ContributorsService);
    pullRequestsService = module.get(PullRequestsService);
  });

  it('calls services in order: org → repo → contributor → PR', async () => {
    const callOrder: string[] = [];
    organizationsService.upsert.mockImplementation(async () => { callOrder.push('org'); return mockOrg as any; });
    repositoriesService.upsert.mockImplementation(async () => { callOrder.push('repo'); return mockRepo as any; });
    contributorsService.upsert.mockImplementation(async () => { callOrder.push('contributor'); return mockAuthor as any; });
    pullRequestsService.upsert.mockImplementation(async () => { callOrder.push('pr'); return undefined as any; });

    await handler.handle({ action: 'opened', pull_request: basePullRequest, repository });

    expect(callOrder).toEqual(['org', 'repo', 'contributor', 'pr']);
  });

  it('upserts PR with state open when action is opened', async () => {
    await handler.handle({ action: 'opened', pull_request: { ...basePullRequest, state: 'open', merged: null }, repository });

    expect(pullRequestsService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: PrState.open, mergedAt: null }),
    );
  });

  it('upserts PR with state closed when action is closed and not merged', async () => {
    await handler.handle({
      action: 'closed',
      pull_request: { ...basePullRequest, state: 'closed', merged: false },
      repository,
    });

    expect(pullRequestsService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: PrState.closed, mergedAt: null }),
    );
  });

  it('upserts PR with state merged and mergedAt set when closed and merged', async () => {
    const mergedAt = '2026-01-20T14:30:00Z';

    await handler.handle({
      action: 'closed',
      pull_request: { ...basePullRequest, state: 'closed', merged: true, merged_at: mergedAt },
      repository,
    });

    expect(pullRequestsService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        state: PrState.merged,
        mergedAt: new Date(mergedAt),
      }),
    );
  });

  it('passes all PR fields to pullRequestsService.upsert', async () => {
    await handler.handle({ action: 'opened', pull_request: basePullRequest, repository });

    expect(pullRequestsService.upsert).toHaveBeenCalledWith({
      githubId: basePullRequest.id,
      repositoryId: mockRepo.id,
      authorId: mockAuthor.id,
      number: basePullRequest.number,
      title: basePullRequest.title,
      url: basePullRequest.html_url,
      state: PrState.open,
      additions: basePullRequest.additions,
      deletions: basePullRequest.deletions,
      changedFiles: basePullRequest.changed_files,
      githubCreatedAt: new Date(basePullRequest.created_at),
      mergedAt: null,
    });
  });
});
