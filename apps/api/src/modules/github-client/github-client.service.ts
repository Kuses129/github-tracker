import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { throttling } from '@octokit/plugin-throttling';
import type { AppConfig } from '../../config/config.schema';

const ThrottledOctokit = Octokit.plugin(throttling);

@Injectable()
export class GitHubClientService implements OnModuleInit {
  private readonly logger = new Logger(GitHubClientService.name);
  private octokit: Octokit | undefined;

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  onModuleInit(): void {
    const appId = this.configService.get('GITHUB_APP_ID', { infer: true });
    const rawKey = this.configService.get('GITHUB_APP_PRIVATE_KEY', { infer: true });
    const installationId = this.configService.get('GITHUB_APP_INSTALLATION_ID', { infer: true });

    if (!appId || !rawKey || !installationId) {
      this.logger.warn('GitHub App credentials not configured; GitHub client disabled');
      return;
    }

    const privateKey = rawKey.replace(/\\n/g, '\n');

    try {
      this.octokit = new ThrottledOctokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey,
          installationId,
        },
        throttle: {
          onRateLimit: (retryAfter, options, _octokit, retryCount) => {
            this.logger.warn(
              { method: options.method, url: options.url, retryAfter, retryCount },
              'Rate limit hit',
            );
            return retryCount < 3;
          },
          onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
            this.logger.warn(
              { method: options.method, url: options.url, retryAfter },
              'Secondary rate limit hit',
            );
            return retryCount < 2;
          },
        },
      });

      this.logger.log('GitHub client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize GitHub client — check GITHUB_APP_* env vars');
      throw error;
    }
  }

  getClient(): Octokit {
    if (!this.octokit) {
      throw new Error('GitHubClientService not initialized');
    }
    return this.octokit;
  }
}
