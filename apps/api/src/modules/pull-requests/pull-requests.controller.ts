import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { CursorPage } from '../../common/pagination/cursor-page.response';
import { PullRequestsService } from './pull-requests.service';
import { PullRequestListQueryDto } from './models/pull-request-list-query.dto';
import type { PullRequestDetailResponse, PullRequestResponse } from './models/pull-request.response';

@Controller()
export class PullRequestsController {
  constructor(private readonly pullRequestsService: PullRequestsService) {}

  @Get('repositories/:repoId/pull-requests')
  async listPullRequests(
    @Param('repoId', ParseUUIDPipe) repoId: string,
    @Query() query: PullRequestListQueryDto,
  ): Promise<CursorPage<PullRequestResponse>> {
    return this.pullRequestsService.listPullRequests(repoId, query);
  }

  @Get('pull-requests/:prId')
  async getPullRequest(@Param('prId', ParseUUIDPipe) prId: string): Promise<PullRequestDetailResponse> {
    return this.pullRequestsService.getPullRequest(prId);
  }
}
