import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from '@golden-abode/types';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      message = (exceptionResponse as any).message || message;
      error = (exceptionResponse as any).error || error;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorBody: ApiErrorResponse = {
      success: false,
      statusCode: status,
      error,
      message: Array.isArray(message) ? message.join(', ') : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorBody);
  }
}
