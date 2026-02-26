import { Injectable, Logger } from '@nestjs/common';
import { CommitsService } from '../../commits/commits.service';
import { ContributorsService } from '../../contributors/contributors.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import type { PushPayload } from '../models/webhook-event.models';

@Injectable()
export class PushHandler {
  private readonly logger = new Logger(PushHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly commitsService: CommitsService,
  ) {}

  async handle(payload: PushPayload): Promise<void> {
    if (!payload.commits?.length) return;

    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
    });

    for (const commit of payload.commits) {
      let authorId: string | null = null;

      if (commit.author.username) {
        const author = await this.contributorsService.upsertByLogin(
          commit.author.username,
        );
        authorId = author.id;
      }

      await this.commitsService.upsert({
        sha: commit.id,
        repositoryId: repo.id,
        authorId,
        message: commit.message,
        committedAt: new Date(commit.timestamp),
      });
    }

    this.logger.log(
      {
        repo: payload.repository.full_name,
        commitCount: payload.commits.length,
      },
      'Push event processed',
    );
  }
}
