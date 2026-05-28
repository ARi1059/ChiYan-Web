import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="ChiYan H5" />} />
      <Route path="/today" element={<Placeholder title="当日通告" />} />
      <Route path="/roster" element={<Placeholder title="模特名册" />} />
      <Route path="/contact" element={<Placeholder title="联系我们" />} />
      <Route path="/m/:code" element={<Placeholder title="模特详情" />} />
      <Route path="*" element={<Placeholder title="未找到" />} />
    </Routes>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>Phase 0 占位页。Phase 2 起按设计稿落地。</p>
    </main>
  );
}
