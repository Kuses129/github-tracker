import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import fastifyRawBody from 'fastify-raw-body';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfig } from './config/config.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: true,
    encoding: false,
    runFirst: true,
  });

  configureApp(app);

  const configService = app.get(ConfigService<AppConfig>);
  const port = configService.get<number>('PORT') ?? 3000;

  await app.listen(port, '0.0.0.0');
}

bootstrap();
