import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateApiClientDto {
  @ApiProperty({ example: 'Aeon Big integration' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsInt()
  organizationId!: number;

  @ApiProperty({ description: 'Role code, e.g. CATALOG_STAFF' })
  @IsString()
  roleCode!: string;

  @ApiProperty({ type: [Number], description: 'Hierarchy nodes the client is assigned to' })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  nodeIds!: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
