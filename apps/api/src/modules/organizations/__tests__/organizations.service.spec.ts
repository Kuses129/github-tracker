import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { OrganizationsRepository } from '../organizations.repository';
import { OrganizationsService } from '../organizations.service';

const makeOrg = (overrides: Partial<{ id: string; githubId: bigint; login: string; createdAt: Date; isActive: boolean }> = {}) => ({
  id: 'org-uuid-1',
  githubId: BigInt(12345),
  login: 'acme-org',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let repository: jest.Mocked<OrganizationsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: OrganizationsRepository,
          useValue: {
            upsert: jest.fn(),
            markInactive: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    repository = module.get(OrganizationsRepository);
  });

  describe('getOrganizations', () => {
    it('returns mapped DTOs with number githubId and ISO string createdAt', async () => {
      const org = makeOrg();
      repository.findAll.mockResolvedValue([org] as any);

      const result = await service.getOrganizations();

      expect(result).toEqual([
        {
          id: org.id,
          githubId: 12345,
          login: org.login,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns empty array when no organizations exist', async () => {
      repository.findAll.mockResolvedValue([]);

      const result = await service.getOrganizations();

      expect(result).toEqual([]);
    });
  });
});
