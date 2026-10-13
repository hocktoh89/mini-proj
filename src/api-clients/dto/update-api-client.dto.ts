import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsIP, IsOptional } from 'class-validator';
import { ApiClientStatus } from '../../generated/prisma/client';

export class UpdateApiClientDto {
  @ApiPropertyOptional({ enum: ApiClientStatus })
  @IsOptional()
  @IsEnum(ApiClientStatus)
  status?: ApiClientStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}
