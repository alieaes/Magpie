// 번들러(Vite)가 파일 주소로 바꿔 주는 가져오기. 도트 글꼴 파일에 쓴다.
declare module '*?url' {
  const url: string;
  export default url;
}

// 번들러(Vite)가 넣어 주는 빌드 정보. 개발 빌드에서만 도트 그림 보기(?sprites)를 연다
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
