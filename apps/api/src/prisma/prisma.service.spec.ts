import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

jest.mock('../generated/prisma', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(function (this: {
      $connect: jest.Mock;
      $disconnect: jest.Mock;
    }) {
      this.$connect = jest.fn().mockResolvedValue(undefined);
      this.$disconnect = jest.fn().mockResolvedValue(undefined);
    }),
  };
});

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('calls $connect on module init', async () => {
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect on module destroy', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });
});
