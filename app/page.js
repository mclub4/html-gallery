export default function HomePage() {
  const galleryPath = "/index.html";

  return (
    <main>
      <p>
        <a href={galleryPath}>HTML PPT GALLERY 열기</a>
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(galleryPath)} + window.location.search + window.location.hash);`,
        }}
      />
    </main>
  );
}
