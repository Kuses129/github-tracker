import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { OrganizationsService } from '../../../organizations/organizations.service';
import { RepositoriesService } from '../../../repositories/repositories.service';
import { InstallationRepositoriesHandler } from '../installation-repositories.handler';

const mockOrg = { id: 'org-uuid', githubId: 1001, login: 'acme-org' };
const mockRepo = { id: 'repo-uuid', githubId: 2001, name: 'backend' };

const installation = {
  id: 99,
  account: { id: 1001, login: 'acme-org' },
};

const addedRepos = [
  { id: 3001, name: 'new-service', full_name: 'acme-org/new-service', private: false, html_url: 'https://github.com/acme-org/new-service' },
];
const removedRepos = [
  { id: 2001, name: 'backend', full_name: 'acme-org/backend', private: false, html_url: 'https://github.com/acme-org/backend' },
];

describe('InstallationRepositoriesHandler', () => {
  let handler: InstallationRepositoriesHandler;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let repositoriesService: jest.Mocked<RepositoriesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationRepositoriesHandler,
        {
          provide: OrganizationsService,
          useValue: {
            upsert: jest.fn().mockResolvedValue(mockOrg),
          },
        },
        {
          provide: RepositoriesService,
          useValue: {
            upsert: jest.fn().mockResolvedValue(mockRepo),
            removeByGithubId: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<InstallationRepositoriesHandler>(InstallationRepositoriesHandler);
    organizationsService = module.get(OrganizationsService);
    repositoriesService = module.get(RepositoriesService);
  });

  it('upserts added repositories', async () => {
    await handler.handle({
      action: 'added',
      installation,
      repositories_added: addedRepos,
      repositories_removed: [],
    });

    expect(organizationsService.upsert).toHaveBeenCalledTimes(1);
    expect(repositoriesService.upsert).toHaveBeenCalledTimes(addedRepos.length);
    expect(repositoriesService.upsert).toHaveBeenCalledWith({
      githubId: addedRepos[0].id,
      organizationId: mockOrg.id,
      name: addedRepos[0].name,
    });
  });

  it('removes each removed repository by github id', async () => {
    await handler.handle({
      action: 'removed',
      installation,
      repositories_added: [],
      repositories_removed: removedRepos,
    });

    expect(repositoriesService.removeByGithubId).toHaveBeenCalledTimes(removedRepos.length);
    expect(repositoriesService.removeByGithubId).toHaveBeenCalledWith(removedRepos[0].id);
  });

  it('handles both added and removed repos in the same payload', async () => {
    await handler.handle({
      action: 'added',
      installation,
      repositories_added: addedRepos,
      repositories_removed: removedRepos,
    });

    expect(repositoriesService.upsert).toHaveBeenCalledTimes(addedRepos.length);
    expect(repositoriesService.removeByGithubId).toHaveBeenCalledTimes(removedRepos.length);
  });
});
