/**
 * Tests for the global validation contract (AC-008, FR-007).
 *
 * `whitelist` + `forbidNonWhitelisted` are unchanged by this feature, and this
 * file pins that: a body with an unknown property must still be a 400, not a
 * silently accepted or silently stripped request. It runs the real
 * `HttpExceptionFilter` as the global filter so the response also reflects
 * what the filter does with a validation `HttpException`.
 */
import { Body, Controller, INestApplication, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsString } from 'class-validator';
import { HttpExceptionFilter } from './http-exception.filter';

class ProbeDto {
  @IsString()
  name!: string;
}

@Controller('probe')
class ProbeController {
  @Post('validated')
  validated(@Body() body: ProbeDto) {
    return { accepted: body };
  }
}

describe('global validation contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // TEST-007 → AC-008 (FR-007)
  it('AC-008: rejects an unknown body property with 400 instead of ignoring it', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validated')
      .send({ name: 'ok', surprise: 'extra' })
      .expect(400);

    // The request is rejected, and the response says which property was refused.
    expect(response.body.message).toBeDefined();
    expect(JSON.stringify(response.body)).toContain('surprise');
  });

  // TEST-008 → AC-008 (FR-007)
  it('AC-008: still accepts a body made only of declared properties', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe/validated')
      .send({ name: 'ok' })
      .expect(201);

    expect(response.body).toEqual({ accepted: { name: 'ok' } });
  });
});
