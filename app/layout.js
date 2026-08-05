export const metadata = {
  title: "HTML PPT GALLERY",
  description: "데이터 분석부터 가이드와 스토리까지, HTML로 만든 프레젠테이션 갤러리",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
