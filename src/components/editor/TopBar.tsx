import {
  Braces,
  Cloud,
  Eye,
  Languages,
  MousePointer2,
  PenTool,
  Play,
  Search,
  Share2,
  Sparkles
} from "lucide-react";
import { tr } from "../../i18n";
import { useDaosStore } from "../../store/useDaosStore";
import type { EditorMode, Language } from "../../types";

const modes: Array<{
  id: EditorMode;
  icon: typeof PenTool;
  labelKey: string;
}> = [
  { id: "design", icon: PenTool, labelKey: "mode.design" },
  { id: "prototype", icon: Play, labelKey: "mode.prototype" },
  { id: "inspect", icon: MousePointer2, labelKey: "mode.inspect" },
  { id: "tokens", icon: Braces, labelKey: "mode.tokens" }
];

export function TopBar() {
  const language = useDaosStore((state) => state.language);
  const mode = useDaosStore((state) => state.mode);
  const setMode = useDaosStore((state) => state.setMode);
  const setLanguage = useDaosStore((state) => state.setLanguage);
  const project = useDaosStore((state) => state.project);

  const nextLanguage: Language = language === "ru" ? "en" : "ru";

  return (
    <header className="top-bar">
      <div className="brand-block">
        <div className="brand-mark">
          <Sparkles size={17} />
        </div>

        <div>
          <div className="brand-title">{tr(language, "brand.name")}</div>
          <div className="brand-subtitle">{tr(language, "brand.subtitle")}</div>
        </div>
      </div>

      <div className="file-pill">
        <span className="file-dot" />
        <span>{project.files[0]?.name ?? tr(language, "top.file")}</span>
      </div>

      <nav className="mode-switcher" aria-label="Editor modes">
        {modes.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === mode;

          return (
            <button
              className={isActive ? "mode-button active" : "mode-button"}
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
            >
              <Icon size={15} />
              <span>{tr(language, item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="top-actions">
        <button className="ghost-button search-button" type="button">
          <Search size={15} />
          <span>{tr(language, "top.search")}</span>
        </button>

        <button className="ghost-button" type="button">
          <Eye size={15} />
          <span>{tr(language, "top.present")}</span>
        </button>

        <button className="primary-button-small" type="button">
          <Share2 size={15} />
          <span>{tr(language, "top.share")}</span>
        </button>

        <button
          className="language-button"
          type="button"
          onClick={() => setLanguage(nextLanguage)}
          title={tr(language, "status.language")}
        >
          <Languages size={16} />
          <span>{language.toUpperCase()}</span>
        </button>

        <div className="save-status">
          <Cloud size={14} />
          <span>{tr(language, "top.saved")}</span>
        </div>
      </div>
    </header>
  );
}