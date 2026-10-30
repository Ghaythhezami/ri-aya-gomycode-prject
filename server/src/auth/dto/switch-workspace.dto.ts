import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchWorkspaceDto {
  @ApiProperty({ description: 'Clinic to scope the new access token to', format: 'uuid' })
  @IsUUID()
  clinicId!: string;
}
