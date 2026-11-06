import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../user-role.enum';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ required: false, enum: ['en', 'ar', 'fr'] })
  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  preferredLocale?: 'en' | 'ar' | 'fr';
}
