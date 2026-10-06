import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const BASE_ENV = {
  DB_HOST: 'localhost',
  DB_USER: 'magpie',
  DB_PASSWORD: '',
  DB_NAME: 'magpie-dev',
};

describe('loadConfig', () => {
  it('빠진 값은 기본값으로 채운다', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.PORT).toBe(3473);
    expect(config.DB_PORT).toBe(3306);
    expect(config.BASE_URL).toBe('http://localhost:5480');
  });

  it('숫자 값은 문자열에서 바꾼다', () => {
    const config = loadConfig({ ...BASE_ENV, PORT: '4000', DB_PORT: '3307' });
    expect(config.PORT).toBe(4000);
    expect(config.DB_PORT).toBe(3307);
  });

  it('필수 키가 없으면 키 이름을 알려준다', () => {
    expect(() => loadConfig({ DB_PASSWORD: '' })).toThrow(/DB_HOST.*DB_USER.*DB_NAME/);
  });
});
