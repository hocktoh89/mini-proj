import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(72)
  password!: string;
}
