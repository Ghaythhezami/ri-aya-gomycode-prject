# Scheduling metrics and waiting model

Implemented as pure functions in `server/src/scheduling/metrics.ts`, unit tested in `metrics.spec.ts`.

## Per doctor and day

- `availableMinutes`: work intervals of the weekday, minus breaks, minus leave.
- `bookedMinutes`: non-cancelled, non-no-show appointments clipped to the available intervals (overlaps counted once).
- `freeMinutes` = available - booked. `utilisation` = round(booked / available x 100).
- `idleGapMinutes`: sum of the gaps between consecutive booked appointments inside the same available interval.

## Waiting model

Appointments of one doctor are taken in start order. Service time is the booked duration times the overrun
factor 1.15. For appointment i:

    finish_i = max(start_i, finish_(i-1)) + service_i
    wait_i   = max(0, finish_(i-1) - start_i)

The doctor estimate is the average of `wait_i`; the clinic estimate is the average over all appointments.

### Worked example

One doctor, three 30-minute appointments at 09:00, 09:30 and 10:30. Service = 30 x 1.15 = 34.5 min.

| i   | start | previous finish | wait | finish  |
| --- | ----- | --------------- | ---- | ------- |
| 1   | 09:00 | none            | 0    | 09:34.5 |
| 2   | 09:30 | 09:34.5         | 4.5  | 10:09   |
| 3   | 10:30 | 10:09           | 0    | 11:04.5 |

Average wait = (0 + 4.5 + 0) / 3 = 1.5 minutes. With 09:00-12:00 availability: booked 90, free 90,
idle gap 30 (10:00-10:30), utilisation 50 %.

## Totals

`appointments`, `bookedMinutes`, `availableMinutes`, `utilisation`, `availability` = free / available %,
`idleGapMinutes` and `estimatedWaitMinutes` (clinic average). Cached in Redis for 60 s under
`metrics:<clinicId>:<date>` and deleted on every appointment or `schedule.optimized` event.
