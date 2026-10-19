import { envSchema } from './config';

export const env = envSchema.parse(process.env);
