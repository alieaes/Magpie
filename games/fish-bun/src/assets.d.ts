// 번들러(Vite)가 파일 주소로 바꿔 주는 가져오기. 도트 글꼴 파일에 쓴다.
declare module '*?url' {
  const url: string;
  export default url;
}
