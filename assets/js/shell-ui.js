function registerShellUi() {
  const SECTION_META = {
    "section-discover": {
      eyebrow: "Panell",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M4 11.5 12 5l8 6.5"></path><path d="M6.5 10.5V19h11v-8.5"></path></svg>`
    },
    "section-recommendations": {
      eyebrow: "Avui",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14"></path><path d="M12 5v14"></path><path d="M7 7h3"></path><path d="M14 14h3"></path></svg>`
    },
    "section-bodyweight": {
      eyebrow: "Sense material",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M7 8v8"></path><path d="M17 8v8"></path><path d="M10 12h4"></path><path d="M4 10h3v4H4z"></path><path d="M17 10h3v4h-3z"></path></svg>`
    },
    "section-catalog": {
      eyebrow: "Catàleg actiu",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M5 6h14"></path><path d="M5 12h14"></path><path d="M5 18h9"></path></svg>`
    },
    "section-planner": {
      eyebrow: "Pla curt",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M7 4v4"></path><path d="M17 4v4"></path><path d="M5 9h14"></path><rect x="5" y="6" width="14" height="13" rx="3"></rect></svg>`
    },
    "section-hidden": {
      eyebrow: "Màquines amagades",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M4 5h16"></path><path d="M6 9h12"></path><path d="M8 13h8"></path><path d="M4 20 20 4"></path></svg>`
    },
    "section-timers": {
      eyebrow: "Temps",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="13" r="7"></circle><path d="M12 9v4l2 2"></path><path d="M9 4h6"></path></svg>`
    },
    "section-log": {
      eyebrow: "Registre express",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M7 4h8l4 4v12H7z"></path><path d="M15 4v4h4"></path><path d="M10 12h6"></path><path d="M10 16h4"></path></svg>`
    },
    "section-session": {
      eyebrow: "Sessió activa",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M6 7h12"></path><path d="M8 12h8"></path><path d="M10 17h4"></path><rect x="4" y="4" width="16" height="16" rx="4"></rect></svg>`
    },
    "section-weekly": {
      eyebrow: "Checklist corporal",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M6 7h12"></path><path d="M6 12h12"></path><path d="M6 17h7"></path><path d="M18 16.5 20 18.5l-3.5 3"></path></svg>`
    },
    "section-history": {
      eyebrow: "Progrés personal",
      icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M5 19V9"></path><path d="M12 19V5"></path><path d="M19 19v-7"></path></svg>`
    }
  };

  document.addEventListener("alpine:init", () => {
    window.Alpine.data("shellUi", () => ({
      navOpen: false,
      activeSectionId: "section-discover",
      lastFocusedElement: null,

      init() {
        this.syncFromHash();
        window.addEventListener("hashchange", () => this.syncFromHash());
        window.addEventListener("gymbros:navigate", (event) => {
          const sectionId = event.detail?.sectionId;
          if (sectionId && document.getElementById(sectionId)) {
            this.goTo(sectionId);
          }
        });
      },

      syncFromHash() {
        const sectionId = window.location.hash.replace(/^#/, "");
        if (sectionId && document.getElementById(sectionId)) {
          this.activeSectionId = sectionId;
          this.focusSection(sectionId, false);
          window.dispatchEvent(new CustomEvent("gymbros:section-changed", { detail: { sectionId } }));
          return;
        }

        this.activeSectionId = "section-discover";
        window.dispatchEvent(new CustomEvent("gymbros:section-changed", { detail: { sectionId: "section-discover" } }));
      },

      openNav() {
        this.lastFocusedElement = document.activeElement;
        this.navOpen = true;
        requestAnimationFrame(() => {
          const activeLink = this.$refs.drawer?.querySelector(".app-nav__link.is-active");
          const firstLink = this.$refs.drawer?.querySelector(".app-nav__link");
          (activeLink || firstLink || this.$refs.drawer)?.focus?.();
        });
      },

      closeNav(restoreFocus = true) {
        this.navOpen = false;
        if (restoreFocus) {
          requestAnimationFrame(() => {
            (this.lastFocusedElement || this.$refs.navToggle)?.focus?.();
          });
        }
      },

      goTo(sectionId) {
        this.activeSectionId = sectionId;
        const nextHash = `#${sectionId}`;
        if (window.location.hash !== nextHash) {
          window.history.pushState(null, "", nextHash);
        }
        this.closeNav(false);
        this.focusSection(sectionId, true);
        window.dispatchEvent(new CustomEvent("gymbros:section-changed", { detail: { sectionId } }));
      },

      isActive(sectionId) {
        return this.activeSectionId === sectionId;
      },

      focusSection(sectionId, resetScroll) {
        requestAnimationFrame(() => {
          const section = document.getElementById(sectionId);
          if (!section) {
            return;
          }
          if (resetScroll) {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }
          section.tabIndex = -1;
          section.focus({ preventScroll: true });
        });
      },

      get currentSectionLabel() {
        const link = document.querySelector(`[data-section-target="${this.activeSectionId}"]`);
        return link?.textContent?.trim() || "Inici";
      },

      get compactSectionEyebrow() {
        return SECTION_META[this.activeSectionId]?.eyebrow || "Flux actual";
      },

      get compactSectionIcon() {
        return SECTION_META[this.activeSectionId]?.icon || SECTION_META["section-discover"].icon;
      }
    }));
  });
}

registerShellUi();
