import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { OrganizationsService } from '../../../organizations/organizations.service';
import { RepositoriesService } from '../../../repositories/repositories.service';
import { InstallationHandler } from '../installation.handler';

const mockOrg = { id: 'org-uuid', githubId: 1001, login: 'acme-org' };
const mockRepo = { id: 'repo-uuid', githubId: 2001, name: 'backend' };

const installation = {
  id: 99,
  account: { id: 1001, login: 'acme-org' },
};

const repoFixtures = [
  { id: 2001, name: 'backend', full_name: 'acme-org/backend', private: false, html_url: 'https://github.com/acme-org/backend' },
  { id: 2002, name: 'frontend', full_name: 'acme-org/frontend', private: false, html_url: 'https://github.com/acme-org/frontend' },
];

describe('InstallationHandler', () => {
  let handler: InstallationHandler;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let repositoriesService: jest.Mocked<RepositoriesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationHandler,
        {
          provide: OrganizationsService,
          useValue: {
            upsert: jest.fn().mockResolvedValue(mockOrg),
            markInactive: jest.fn().mockResolvedValue(undefined),
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

    handler = module.get<InstallationHandler>(InstallationHandler);
    organizationsService = module.get(OrganizationsService);
    repositoriesService = module.get(RepositoriesService);
  });

  describe('handleInstallation', () => {
    it('upserts org and all repos when action is created', async () => {
      await handler.handleInstallation({ action: 'created', installation, repositories: repoFixtures });

      expect(organizationsService.upsert).toHaveBeenCalledTimes(1);
      expect(organizationsService.upsert).toHaveBeenCalledWith({
        githubId: installation.account.id,
        login: installation.account.login,
      });
      expect(repositoriesService.upsert).toHaveBeenCalledTimes(repoFixtures.length);
      expect(repositoriesService.upsert).toHaveBeenCalledWith({
        githubId: repoFixtures[0].id,
        organizationId: mockOrg.id,
        name: repoFixtures[0].name,
      });
    });

    it('marks org inactive and does not upsert repos when action is deleted', async () => {
      await handler.handleInstallation({ action: 'deleted', installation });

      expect(organizationsService.markInactive).toHaveBeenCalledTimes(1);
      expect(organizationsService.markInactive).toHaveBeenCalledWith(installation.account.id);
      expect(repositoriesService.upsert).not.toHaveBeenCalled();
    });

    it('handles created action with no repositories gracefully', async () => {
      await handler.handleInstallation({ action: 'created', installation, repositories: [] });

      expect(organizationsService.upsert).toHaveBeenCalledTimes(1);
      expect(repositoriesService.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleInstallationRepositories', () => {
    const addedRepos = [
      { id: 3001, name: 'new-service', full_name: 'acme-org/new-service', private: false, html_url: 'https://github.com/acme-org/new-service' },
    ];
    const removedRepos = [
      { id: 2001, name: 'backend', full_name: 'acme-org/backend', private: false, html_url: 'https://github.com/acme-org/backend' },
    ];

    it('upserts added repositories', async () => {
      await handler.handleInstallationRepositories({
        action: 'added',
        installation,
        repositories_added: addedRepos,
        repositories_removed: [],
      });

      expect(repositoriesService.upsert).toHaveBeenCalledTimes(addedRepos.length);
      expect(repositoriesService.upsert).toHaveBeenCalledWith({
        githubId: addedRepos[0].id,
        organizationId: mockOrg.id,
        name: addedRepos[0].name,
      });
    });

    it('removes each removed repository by github id', async () => {
      await handler.handleInstallationRepositories({
        action: 'removed',
        installation,
        repositories_added: [],
        repositories_removed: removedRepos,
      });

      expect(repositoriesService.removeByGithubId).toHaveBeenCalledTimes(removedRepos.length);
      expect(repositoriesService.removeByGithubId).toHaveBeenCalledWith(removedRepos[0].id);
    });

    it('handles both added and removed repos in the same payload', async () => {
      await handler.handleInstallationRepositories({
        action: 'added',
        installation,
        repositories_added: addedRepos,
        repositories_removed: removedRepos,
      });

      expect(repositoriesService.upsert).toHaveBeenCalledTimes(addedRepos.length);
      expect(repositoriesService.removeByGithubId).toHaveBeenCalledTimes(removedRepos.length);
    });
  });
});
