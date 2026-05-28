import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="ChiYan Admin Console" />} />
      <Route path="/login" element={<Placeholder title="登录" />} />
      <Route path="*" element={<Placeholder title="未找到" />} />
    </Routes>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>Phase 0 占位页。Phase 3 起按设计稿落地。</p>
    </main>
  );
}
