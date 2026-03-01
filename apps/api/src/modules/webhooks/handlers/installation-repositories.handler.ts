import { Injectable } from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import type { InstallationRepositoriesPayload } from '../models/webhook-event.models';
import type { WebhookHandler } from './webhook-handler.interface';

@Injectable()
export class InstallationRepositoriesHandler implements WebhookHandler {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const { installation, repositories_added, repositories_removed } =
      payload as InstallationRepositoriesPayload;

    const org = await this.organizationsService.upsert({
      githubId: installation.account.id,
      login: installation.account.login,
    });

    for (const repo of repositories_added) {
      await this.repositoriesService.upsert({
        githubId: repo.id,
        organizationId: org.id,
        name: repo.name,
      });
    }

    for (const repo of repositories_removed) {
      await this.repositoriesService.removeByGithubId(repo.id);
    }
  }
}
