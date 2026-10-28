import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class InviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Clinic the invitee joins' })
  @IsUUID()
  clinicId!: string;

  @ApiProperty({ enum: UserRole })
  @IsIn(Object.values(UserRole))
  role!: UserRole;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  organizationName!: string;

  @ApiProperty()
  @IsString()
  clinicName!: string;
}
