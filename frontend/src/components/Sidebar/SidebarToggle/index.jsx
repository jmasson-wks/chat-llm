import React, { useEffect, useState } from "react";
import { SidebarSimple } from "@phosphor-icons/react";
import paths from "@/utils/paths";
import { useLocation } from "react-router-dom";
import { Tooltip } from "react-tooltip";
const SIDEBAR_TOGGLE_STORAGE_KEY = "anythingllm_sidebar_toggle";
export const SIDEBAR_TOGGLE_EVENT = "sidebar-toggle";

/**
 * Returns the previous state of the sidebar from localStorage.
 * If the sidebar was closed, returns false.
 * If the sidebar was open, returns true.
 * If the sidebar state is not set, returns true.
 * @returns {boolean}
 */
function previousSidebarState() {
  const previousState = window.localStorage.getItem(SIDEBAR_TOGGLE_STORAGE_KEY);
  if (previousState === "closed") return false;
  return true;
}

export function useSidebarToggle() {
  const [showSidebar, setShowSidebar] = useState(previousSidebarState());
  const [canToggleSidebar, setCanToggleSidebar] = useState(true);
  // [base-path] useLocation() strips the basename automatically, so the regexes
  // and `paths.home()` comparison below stay valid under any BASE_PATH.
  // window.location.pathname would include the basename (e.g. "/ia/workspace/foo")
  // and break the comparisons.
  const location = useLocation();

  useEffect(() => {
    function checkPath() {
      const currentPath = location.pathname;
      const isVisible =
        currentPath === paths.home() ||
        /^\/workspace\/[^\/]+$/.test(currentPath) ||
        /^\/workspace\/[^\/]+\/t\/[^\/]+$/.test(currentPath);
      setCanToggleSidebar(isVisible);
    }
    checkPath();
  }, [location.pathname]);

  useEffect(() => {
    function toggleSidebar(e) {
      if (!canToggleSidebar) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        setShowSidebar((prev) => {
          const newState = !prev;
          window.localStorage.setItem(
            SIDEBAR_TOGGLE_STORAGE_KEY,
            newState ? "open" : "closed"
          );
          return newState;
        });
      }
    }
    window.addEventListener("keydown", toggleSidebar);
    return () => {
      window.removeEventListener("keydown", toggleSidebar);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_TOGGLE_STORAGE_KEY,
      showSidebar ? "open" : "closed"
    );
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_TOGGLE_EVENT, {
        detail: { open: showSidebar },
      })
    );
  }, [showSidebar]);

  return { showSidebar, setShowSidebar, canToggleSidebar };
}

export function ToggleSidebarButton({ showSidebar, setShowSidebar }) {
  const isMac = navigator.userAgent.includes("Mac");
  const shortcut = isMac ? "⌘ + Shift + S" : "Ctrl + Shift + S";

  return (
    <>
      <button
        type="button"
        className={`hidden md:block border-none bg-transparent outline-none ring-0 absolute transition-all duration-500 z-10 ${showSidebar ? "top-[18px] left-[248px]" : "top-[20px] left-[30px]"}`}
        onClick={() => setShowSidebar((prev) => !prev)}
        data-tooltip-id="sidebar-toggle"
        data-tooltip-content={
          showSidebar
            ? `Hide Sidebar (${shortcut})`
            : `Show Sidebar (${shortcut})`
        }
        aria-label={
          showSidebar
            ? `Hide Sidebar (${shortcut})`
            : `Show Sidebar (${shortcut})`
        }
      >
        <SidebarSimple
          className="text-theme-text-secondary hover:text-theme-text-primary"
          size={24}
        />
      </button>
      <Tooltip
        id="sidebar-toggle"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </>
  );
}
