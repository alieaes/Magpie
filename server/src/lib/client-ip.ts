// 요청한 사람의 IP. 근거: docs/design/261024-02-admin-play-history.md §1
// 운영은 Cloudflare → nginx → API 서버(127.0.0.1)라 연결 주소는 늘 nginx다. Cloudflare가 붙이는 CF-Connecting-IP를 먼저 본다.
// Cloudflare를 거치지 않고 바로 오면 이 헤더를 꾸밀 수 있으므로 보기와 횟수 제한에만 쓰고 권한에는 쓰지 않는다.

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

const MAX_LENGTH = 45; // IPv6 최대 길이

/** IPv4가 IPv6 꼴(::ffff:1.2.3.4)로 오면 IPv4로 줄이고 길이를 자른다 */
function normalize(ip: string): string {
  const trimmed = ip.trim();
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return (v4 ? v4[1]! : trimmed).slice(0, MAX_LENGTH);
}

/** 요청한 사람의 IP: CF-Connecting-IP, 없으면 연결 주소. 둘 다 모르면 null (테스트 요청 등) */
export function clientIp(c: Context): string | null {
  const forwarded = c.req.header('cf-connecting-ip');
  if (forwarded?.trim()) return normalize(forwarded);
  try {
    const address = getConnInfo(c).remote.address;
    return address ? normalize(address) : null;
  } catch {
    return null;
  }
}
