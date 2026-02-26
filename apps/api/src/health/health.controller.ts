import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import type { HealthResponseModel } from './models/health-response.model';

@Controller({ path: 'health', version: undefined })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponseModel {
    return this.healthService.getHealth();
  }
}
