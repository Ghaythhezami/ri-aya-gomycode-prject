import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  LogIn,
  PlayCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AppointmentStatus } from '@riaya/shared';

/** Same glyphs as `StatusBadge`, for blocks too small to host a badge. */
export const STATUS_ICON: Record<AppointmentStatus, LucideIcon> = {
  SCHEDULED: CircleDashed,
  CONFIRMED: CheckCircle2,
  CHECKED_IN: LogIn,
  IN_PROGRESS: PlayCircle,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
  NO_SHOW: CircleSlash,
};
