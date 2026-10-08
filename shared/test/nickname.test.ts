import { describe, expect, it } from 'vitest';
import { checkNickname } from '../src/nickname';

describe('checkNickname', () => {
  it('한글·영문·숫자·밑줄 2~12자는 통과하고 앞뒤 공백은 지운다', () => {
    expect(checkNickname('까치01')).toEqual({ ok: true, value: '까치01' });
    expect(checkNickname('  Magpie_fan  ')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(checkNickname('  sky_99  ')).toEqual({ ok: true, value: 'sky_99' });
    expect(checkNickname('ㅋㅋ')).toEqual({ ok: true, value: 'ㅋㅋ' });
    expect(checkNickname('가나다라마바사아자차카타')).toMatchObject({ ok: true });
  });

  it('길이가 맞지 않으면 length', () => {
    expect(checkNickname('a')).toMatchObject({ ok: false, reason: 'length' });
    expect(checkNickname('가나다라마바사아자차카타파')).toMatchObject({ ok: false, reason: 'length' });
    expect(checkNickname('   ')).toMatchObject({ ok: false, reason: 'length' });
  });

  it('공백·특수문자·다른 공백 문자는 chars', () => {
    expect(checkNickname('까 치')).toMatchObject({ ok: false, reason: 'chars' });
    expect(checkNickname('hello!')).toMatchObject({ ok: false, reason: 'chars' });
    expect(checkNickname('까　치')).toMatchObject({ ok: false, reason: 'chars' });
    expect(checkNickname('a​b')).toMatchObject({ ok: false, reason: 'chars' });
  });

  it('운영자 사칭은 reserved', () => {
    expect(checkNickname('관리자')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(checkNickname('운영자123')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(checkNickname('SuperAdmin')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(checkNickname('까치')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(checkNickname('까치01')).toMatchObject({ ok: true });
  });
});
