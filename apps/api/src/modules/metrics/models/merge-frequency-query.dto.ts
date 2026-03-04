import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class MergeFrequencyQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsIn(['day', 'week', 'month'])
  groupBy!: 'day' | 'week' | 'month';

  @IsOptional()
  @IsString()
  repositories?: string;
}
