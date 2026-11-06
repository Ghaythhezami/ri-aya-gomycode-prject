import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class InviteDto {
  @ApiProperty()
  @IsEmail()
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

/** Declining an invitation (FR-044). The token alone identifies the invitation. */
export class DeclineInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;
}

/** Changing a member's role within the caller's scope (FR-045). */
export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsIn(Object.values(UserRole))
  role!: UserRole;
}
