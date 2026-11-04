import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchWorkspaceDto {
  @ApiProperty({
    description:
      'Clinic to scope the new access token to. A selector, not a scope claim: it must be one of the caller’s active memberships.',
    format: 'uuid',
  })
  @IsUUID()
  clinicId!: string;
}
