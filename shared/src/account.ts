// 회원 탈퇴. 화면(입력 안내)과 서버(최종 확인)가 같이 쓴다. 근거: docs/design/261008-01-account-delete.md

/** 탈퇴 확인으로 입력해야 하는 문구: 닉네임, 닉네임 전이면 "탈퇴" */
export function deleteConfirmText(nickname: string | null): string {
  return nickname ?? '탈퇴';
}

/** 개발용 테스트 로그인의 계정 수 (테스트1~N). 서버(번호 검사)와 화면(버튼)이 같이 쓴다. 근거: docs/design/261022-05-dev-login.md */
export const DEV_LOGIN_ACCOUNTS = 3;
