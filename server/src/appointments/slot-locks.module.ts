import { Module } from '@nestjs/common';
import { SlotLockService } from './slot-lock.service';

@Module({ providers: [SlotLockService], exports: [SlotLockService] })
export class SlotLocksModule {}
