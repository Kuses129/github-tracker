import { Injectable, Logger } from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import type {
  InstallationPayload,
  InstallationRepositoriesPayload,
} from '../models/webhook-event.models';

@Injectable()
export class InstallationHandler {
  private readonly logger = new Logger(InstallationHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async handleInstallation(payload: InstallationPayload): Promise<void> {
    const { action, installation, repositories } = payload;

    if (action === 'created') {
      const org = await this.organizationsService.upsert({
        githubId: installation.account.id,
        login: installation.account.login,
      });

      for (const repo of repositories ?? []) {
        await this.repositoriesService.upsert({
          githubId: repo.id,
          organizationId: org.id,
          name: repo.name,
        });
      }

      this.logger.log(
        {
          orgLogin: installation.account.login,
          repoCount: repositories?.length ?? 0,
        },
        'Installation created',
      );
    }

    if (action === 'deleted') {
      await this.organizationsService.markInactive(installation.account.id);
      this.logger.log(
        { orgLogin: installation.account.login },
        'Installation deleted',
      );
    }
  }

  async handleInstallationRepositories(
    payload: InstallationRepositoriesPayload,
  ): Promise<void> {
    const org = await this.organizationsService.upsert({
      githubId: payload.installation.account.id,
      login: payload.installation.account.login,
    });

    for (const repo of payload.repositories_added) {
      await this.repositoriesService.upsert({
        githubId: repo.id,
        organizationId: org.id,
        name: repo.name,
      });
    }

    for (const repo of payload.repositories_removed) {
      await this.repositoriesService.removeByGithubId(repo.id);
    }
  }
}
