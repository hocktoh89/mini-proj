import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// The node's level is derived: level 1 without a parent, otherwise one below the parent.
export class CreateNodeDto {
  @ApiProperty({ example: 'Malaysia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Omit to create a top (level 1) node' })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ description: 'Required for a top node; implied by the parent otherwise' })
  @IsOptional()
  @IsInt()
  organizationId?: number;
}
