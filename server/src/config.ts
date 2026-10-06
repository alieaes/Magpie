import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3473),
  BASE_URL: z.url().default('http://localhost:5480'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
});

/** 서버 설정. 값은 환경 변수(.env)에서 온다 */
export type Config = z.infer<typeof EnvSchema>;

/** .env 파일이 있으면 process.env로 읽어들인다. 파일이 없으면 넘어간다 */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** 환경 변수로 설정을 만든다. 빠지거나 잘못된 키가 있으면 키 이름을 알려주고 멈춘다 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`설정 값이 없거나 잘못됐다: ${keys} (server/.env 확인)`);
  }
  return result.data;
}
