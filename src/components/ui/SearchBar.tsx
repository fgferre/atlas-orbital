import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { motion, AnimatePresence } from "framer-motion";

export const SearchBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectId = useStore((state) => state.selectId);

  // Filter bodies based on query
  const filteredBodies = SOLAR_SYSTEM_BODIES.filter((body) =>
    body.name.en.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5); // Limit to 5 results

  const handleSelect = (id: string) => {
    selectId(id);
    setQuery("");
    setIsOpen(false);
  };

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative pointer-events-auto flex justify-end"
    >
      <div
        className={`flex items-center tech-panel tech-transition ${isOpen ? "w-64" : "w-12 h-12"}`}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.input
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "100%" }}
              exit={{ opacity: 0, width: 0 }}
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-4 pr-12 bg-transparent border-none text-sm text-white focus:outline-none font-rajdhani uppercase tracking-wider"
            />
          )}
        </AnimatePresence>

        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className={`absolute right-0 w-12 h-12 flex items-center justify-center text-nasa-accent hover:text-white transition-colors z-10`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </button>
      </div>

      {/* Results Dropdown */}
      <AnimatePresence>
        {isOpen && query.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-14 right-0 w-64 tech-panel overflow-hidden shadow-lg z-50"
          >
            {filteredBodies.length > 0 ? (
              filteredBodies.map((body) => (
                <button
                  key={body.id}
                  onClick={() => handleSelect(body.id)}
                  className="w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center justify-between group"
                >
                  <span className="text-sm font-rajdhani font-bold text-white group-hover:text-nasa-accent transition-colors">
                    {body.name.en}
                  </span>
                  <span className="text-[10px] text-white/50 uppercase tracking-wider">
                    {body.type}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-white/50 text-center font-rajdhani">
                No results found
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
