import { Module } from '@nestjs/common';
import { GitHubClientService } from './github-client.service';

@Module({
  providers: [GitHubClientService],
  exports: [GitHubClientService],
})
export class GitHubClientModule {}
