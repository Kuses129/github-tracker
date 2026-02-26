import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CommitsService } from '../../../commits/commits.service';
import { ContributorsService } from '../../../contributors/contributors.service';
import { OrganizationsService } from '../../../organizations/organizations.service';
import { RepositoriesService } from '../../../repositories/repositories.service';
import { mockOrg, mockRepo, repository } from '../../../../test/webhook.helpers';
import { PushHandler } from '../push.handler';

const mockAuthor = { id: 'author-uuid' };
const sender = { id: 501, login: 'dev-jane' };

function makeCommit(sha: string, username?: string) {
  return {
    id: sha,
    message: `feat: commit ${sha}`,
    timestamp: '2026-01-18T08:00:00Z',
    author: { name: 'Dev Jane', email: 'jane@example.com', username },
  };
}

function buildPayload(commits: ReturnType<typeof makeCommit>[]) {
  return { ref: 'refs/heads/main', before: 'abc', after: 'def', commits, repository, sender };
}

describe('PushHandler', () => {
  let handler: PushHandler;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let repositoriesService: jest.Mocked<RepositoriesService>;
  let contributorsService: jest.Mocked<ContributorsService>;
  let commitsService: jest.Mocked<CommitsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushHandler,
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
          useValue: { upsertByLogin: jest.fn().mockResolvedValue(mockAuthor) },
        },
        {
          provide: CommitsService,
          useValue: { upsert: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    handler = module.get<PushHandler>(PushHandler);
    organizationsService = module.get(OrganizationsService);
    repositoriesService = module.get(RepositoriesService);
    contributorsService = module.get(ContributorsService);
    commitsService = module.get(CommitsService);
  });

  it('returns early without any service calls when commits array is empty', async () => {
    await handler.handle(buildPayload([]));

    expect(organizationsService.upsert).not.toHaveBeenCalled();
    expect(commitsService.upsert).not.toHaveBeenCalled();
  });

  it('calls commitsService.upsert once per commit for 3 commits', async () => {
    const commits = [makeCommit('sha1', 'dev-jane'), makeCommit('sha2', 'dev-jane'), makeCommit('sha3', 'dev-jane')];

    await handler.handle(buildPayload(commits));

    expect(commitsService.upsert).toHaveBeenCalledTimes(3);
  });

  it('calls contributorsService.upsertByLogin and passes authorId when commit has username', async () => {
    const commit = makeCommit('sha-with-user', 'dev-jane');

    await handler.handle(buildPayload([commit]));

    expect(contributorsService.upsertByLogin).toHaveBeenCalledWith('dev-jane');
    expect(commitsService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: mockAuthor.id }),
    );
  });

  it('does not call contributorsService.upsertByLogin and passes authorId null when commit has no username', async () => {
    const commit = makeCommit('sha-no-user', undefined);

    await handler.handle(buildPayload([commit]));

    expect(contributorsService.upsertByLogin).not.toHaveBeenCalled();
    expect(commitsService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: null }),
    );
  });

  it('passes all commit fields to commitsService.upsert', async () => {
    const commit = makeCommit('abc123', 'dev-jane');

    await handler.handle(buildPayload([commit]));

    expect(commitsService.upsert).toHaveBeenCalledWith({
      sha: commit.id,
      repositoryId: mockRepo.id,
      authorId: mockAuthor.id,
      message: commit.message,
      committedAt: new Date(commit.timestamp),
    });
  });

  it('handles a mix of commits with and without usernames', async () => {
    const commits = [makeCommit('sha-a', 'dev-jane'), makeCommit('sha-b', undefined), makeCommit('sha-c', 'dev-bob')];

    await handler.handle(buildPayload(commits));

    expect(contributorsService.upsertByLogin).toHaveBeenCalledTimes(2);
    expect(commitsService.upsert).toHaveBeenCalledTimes(3);

    const secondCall = commitsService.upsert.mock.calls[1][0];
    expect(secondCall.authorId).toBeNull();
  });
});
