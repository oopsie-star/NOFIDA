import { Canvas } from "./components/editor/Canvas";
import { LeftSidebar } from "./components/editor/LeftSidebar";
import { RightInspector } from "./components/editor/RightInspector";
import { StatusBar } from "./components/editor/StatusBar";
import { TopBar } from "./components/editor/TopBar";

export default function App() {
  return (
    <main className="daos-app">
      <TopBar />

      <section className="editor-grid">
        <LeftSidebar />
        <Canvas />
        <RightInspector />
      </section>

      <StatusBar />
    </main>
  );
}