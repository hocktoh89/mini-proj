import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Move under another parent at the same level as the current one (subtree moves too)',
  })
  @IsOptional()
  @IsInt()
  parentId?: number;
}
