import { Injectable, Logger } from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import type { InstallationPayload } from '../models/webhook-event.models';
import type { WebhookHandler } from './webhook-handler.interface';

@Injectable()
export class InstallationHandler implements WebhookHandler {
  private readonly logger = new Logger(InstallationHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const { action, installation, repositories } =
      payload as InstallationPayload;

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
}
