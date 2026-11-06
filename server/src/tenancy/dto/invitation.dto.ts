import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class InviteDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description:
      'Clinic the invitee joins. A selector, not a scope claim: it is resolved inside the caller’s own organization.',
  })
  @IsUUID()
  clinicId!: string;

  @ApiProperty({ enum: UserRole })
  @IsIn(Object.values(UserRole))
  role!: UserRole;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  organizationName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  clinicName!: string;
}
