import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 'CATALOG_STAFF' })
  @IsString()
  roleCode!: string;
}
