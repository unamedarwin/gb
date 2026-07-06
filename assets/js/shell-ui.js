function registerShellUi() {
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
        return link?.textContent?.trim() || "Comencar";
      }
    }));
  });
}

registerShellUi();
