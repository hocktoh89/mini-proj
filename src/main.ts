import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  if (process.env.FRONTEND_ORIGIN) {
    app.enableCors({ origin: process.env.FRONTEND_ORIGIN, credentials: true });
  }

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription('API documentation for the Backend')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(process.env.REFRESH_TOKEN_COOKIE_NAME ?? 'refresh_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3800);
}
void bootstrap();
