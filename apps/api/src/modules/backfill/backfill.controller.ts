import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { BackfillService } from './backfill.service';

@Controller('organizations/:orgId/backfill')
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerBackfill(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<{ backfillRunId: string }> {
    return this.backfillService.triggerBackfill(orgId);
  }
}
