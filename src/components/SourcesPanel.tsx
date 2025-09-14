import { useState } from "react";
import { useGraphStore } from "../store/useGraphStore";

const SourcesPanel = () => {
  const [openTab, setOpenTab] = useState<"sources" | null>(null);
  const sources = useGraphStore((s) => s.sources);

  return (
    <div className="absolute top-4 right-4 w-80 bg-white shadow-lg rounded-lg overflow-hidden border ">
      {/* Tab bar */}
      <div className="flex border-b">
        <button
          onClick={() =>
            setOpenTab(openTab === "sources" ? null : "sources")
          }
          className={`flex-1 px-4 py-2 text-sm font-medium text-gray-500 ${
            openTab === "sources" ? "bg-gray-100 border-b-2 border-blue-600" : ""
          }`}
        >
          Sources
        </button>
      </div>

      {/* Tab content */}
      {openTab === "sources" && (
        <div className="max-h-64 overflow-y-auto p-3">
          {sources.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No sources yet — run a search to see them here.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sources.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SourcesPanel;
