import "../css/main.css";
import "../css/links-talks.css";

declare global {
  interface MoonlitMountainI18nConfig {
    locale?: string;
    messages?: Record<string, string>;
  }

  interface Window {
    MoonlitMountainI18n?: MoonlitMountainI18nConfig;
    SearchWidget?: {
      open: () => void;
    };
  }
}

const defaultMessages = {
  momentUpvote: "喜欢这个瞬间",
  momentUpvoted: "已喜欢这个瞬间",
  momentUpvotePending: "正在记录喜欢。",
  momentUpvoteSuccess: "已喜欢这个瞬间。",
  momentUpvoteError: "暂时无法记录喜欢，请稍后重试。",
  unknownTime: "时间未记录",
  untitledUpdate: "未命名近况",
  friendSite: "友邻站点",
  feedSourceLabel: "访问订阅来源：{0}",
  feedStoryLabel: "阅读 {0} 的文章：{1}",
  read: "阅读",
  feedUnavailable: "原文地址暂不可用",
  feedLoadMore: "查看更早近况",
  feedLoadingButton: "正在捎来…",
  feedLoadingStatus: "正在加载更早近况。",
  feedLoaded: "已加载 {0} 条更早近况。",
  feedReachedStart: "已抵达最早一篇",
  feedLoadedReachedStart: "已加载 {0} 条更早近况，已经抵达最早一篇。",
  feedRetry: "重试查看更早近况",
  feedError: "这次没能捎来更早近况，请重试。",
  submenuExpand: "展开 {0} 子菜单",
  submenuCollapse: "收起 {0} 子菜单",
  submenuCurrent: "当前",
  menuOpen: "打开菜单",
  menuClose: "关闭菜单",
  socialDefaultName: "社交媒体",
  socialImageAlt: "{0} 图片",
  tocSection: "章节 {0}",
  tocOpen: "打开文章目录",
  tocClose: "关闭文章目录",
  readingTime: "约 {0} 分钟阅读",
  shareComplete: "分享完成。",
  linkCopied: "链接已复制，可以粘贴分享。",
  shareError: "暂时无法分享，请复制地址栏链接。",
  readerReset: "已恢复默认排版。",
} as const;

type MessageKey = keyof typeof defaultMessages;

const runtimeI18n = window.MoonlitMountainI18n;
const locale = runtimeI18n?.locale || document.documentElement.lang || "zh-CN";
const message = (key: MessageKey) => runtimeI18n?.messages?.[key] || defaultMessages[key];
const formatMessage = (key: MessageKey, ...values: Array<string | number>) =>
  message(key).replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? placeholder : String(value);
  });

type MoonPhase = "midnight" | "twilight" | "moonlight" | "system";
type ResolvedMoonPhase = Exclude<MoonPhase, "system">;
type MoonPhaseTransitionLayer = "old" | "new";

interface MoonPhaseViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
}

interface MoonPhaseTransitionOrigin {
  phase: MoonPhase;
  x: number;
  y: number;
}

interface ActiveMoonPhaseTransition {
  viewTransition?: MoonPhaseViewTransition;
  animation?: Animation;
}

type MoonPhaseTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => MoonPhaseViewTransition;
};

type ViewTransitionAnimationOptions = KeyframeAnimationOptions & {
  pseudoElement: string;
};

const moonPhaseStorageKey = "moonlit-mountain.moon-phase.v1";
const moonPhaseValues = new Set<MoonPhase>(["midnight", "twilight", "moonlight", "system"]);
const moonPhaseLightness: Record<ResolvedMoonPhase, number> = {
  midnight: 0,
  twilight: 1,
  moonlight: 2,
};
const root = document.documentElement;
const systemLightPreference = window.matchMedia("(prefers-color-scheme: light)");
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const transitionDocument = document as MoonPhaseTransitionDocument;
const startMoonPhaseViewTransition = transitionDocument.startViewTransition?.bind(document);
const headerPreferenceSwitchers = Array.from(
  document.querySelectorAll<HTMLDetailsElement>("[data-header-preference-switcher]"),
);
const moonPhaseSwitcher = document.querySelector<HTMLDetailsElement>("[data-moon-phase-switcher]");
const moonPhaseOptions = Array.from(
  document.querySelectorAll<HTMLInputElement>("[data-moon-phase-option]"),
);
const moonPhaseCurrent = document.querySelector<HTMLElement>("[data-moon-phase-current]");
const moonPhaseSummary = moonPhaseSwitcher?.querySelector<HTMLElement>("summary");
const languageSwitcher = document.querySelector<HTMLDetailsElement>("[data-language-switcher]");
const languageOptions = Array.from(
  languageSwitcher?.querySelectorAll<HTMLInputElement>("[data-language-option]") || [],
);
const languageSummary = languageSwitcher?.querySelector<HTMLElement>("summary");

let activeMoonPhaseTransition: ActiveMoonPhaseTransition | undefined;
let pointerTransitionOrigin: MoonPhaseTransitionOrigin | undefined;

const isMoonPhase = (value: string | undefined | null): value is MoonPhase =>
  Boolean(value && moonPhaseValues.has(value as MoonPhase));

const configuredMoonPhase: MoonPhase = isMoonPhase(root.dataset.defaultMoonPhase)
  ? root.dataset.defaultMoonPhase
  : "midnight";

const resolveMoonPhase = (phase: MoonPhase): ResolvedMoonPhase =>
  phase === "system" ? (systemLightPreference.matches ? "moonlight" : "midnight") : phase;

const commitMoonPhase = (phase: MoonPhase, persist = false) => {
  const resolvedPhase = resolveMoonPhase(phase);
  root.dataset.moonPhase = phase;
  root.dataset.resolvedMoonPhase = resolvedPhase;
  root.dataset.colorScheme = resolvedPhase === "moonlight" ? "light" : "dark";
  moonPhaseOptions.forEach((option) => {
    option.checked = option.value === phase;
  });
  const activeOption = moonPhaseOptions.find((option) => option.value === phase);
  const activeLabel = activeOption
    ?.closest<HTMLElement>(".moon-phase-option")
    ?.querySelector<HTMLElement>("strong")
    ?.textContent?.trim();
  if (moonPhaseCurrent && activeLabel) moonPhaseCurrent.textContent = activeLabel;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute(
    "content",
    resolvedPhase === "moonlight" ? "#e8eff0" : resolvedPhase === "twilight" ? "#171e22" : "#18181b",
  );

  if (persist) {
    try {
      localStorage.setItem(moonPhaseStorageKey, phase);
    } catch {
      // The visual choice still applies to this page when storage is unavailable.
    }
  }

  document.dispatchEvent(
    new CustomEvent("moonlit-mountain:moon-phase-change", {
      detail: { phase, resolvedPhase },
    }),
  );
};

const cancelMoonPhaseTransition = () => {
  const activeTransition = activeMoonPhaseTransition;
  activeMoonPhaseTransition = undefined;
  root.removeAttribute("data-moon-phase-transition");
  activeTransition?.animation?.cancel();
  activeTransition?.viewTransition?.skipTransition();
};

const applyMoonPhaseImmediately = (phase: MoonPhase, persist = false) => {
  cancelMoonPhaseTransition();
  commitMoonPhase(phase, persist);
};

const getMoonPhaseTransitionOrigin = (option: HTMLInputElement) => {
  if (pointerTransitionOrigin?.phase === option.value) {
    return { x: pointerTransitionOrigin.x, y: pointerTransitionOrigin.y };
  }

  const optionElement = option.closest<HTMLElement>(".moon-phase-option");
  const anchor = optionElement?.querySelector<HTMLElement>(".moon-phase-symbol") || optionElement;
  const rect = anchor?.getBoundingClientRect() || moonPhaseSummary?.getBoundingClientRect();
  return {
    x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
  };
};

const applyMoonPhaseWithTransition = (
  phase: MoonPhase,
  persist: boolean,
  origin: { x: number; y: number },
) => {
  const currentPhase = isMoonPhase(root.dataset.moonPhase)
    ? root.dataset.moonPhase
    : configuredMoonPhase;
  const currentResolvedPhase = resolveMoonPhase(currentPhase);
  const nextResolvedPhase = resolveMoonPhase(phase);

  if (
    !startMoonPhaseViewTransition ||
    reducedMotionPreference.matches ||
    currentResolvedPhase === nextResolvedPhase
  ) {
    applyMoonPhaseImmediately(phase, persist);
    return;
  }

  const x = Math.min(Math.max(origin.x, 0), window.innerWidth);
  const y = Math.min(Math.max(origin.y, 0), window.innerHeight);
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const transitionLayer: MoonPhaseTransitionLayer =
    moonPhaseLightness[nextResolvedPhase] > moonPhaseLightness[currentResolvedPhase]
      ? "new"
      : "old";
  const clipPath = [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${radius}px at ${x}px ${y}px)`,
  ];

  const transitionOwner: ActiveMoonPhaseTransition = {};
  const previousTransition = activeMoonPhaseTransition;
  activeMoonPhaseTransition = transitionOwner;
  previousTransition?.animation?.cancel();
  previousTransition?.viewTransition?.skipTransition();
  root.dataset.moonPhaseTransition = transitionLayer;

  let transition: MoonPhaseViewTransition;

  try {
    transition = startMoonPhaseViewTransition(() => {
      if (activeMoonPhaseTransition !== transitionOwner) return;
      commitMoonPhase(phase, persist);
    });
  } catch {
    if (activeMoonPhaseTransition === transitionOwner) {
      activeMoonPhaseTransition = undefined;
      root.removeAttribute("data-moon-phase-transition");
      commitMoonPhase(phase, persist);
    }
    return;
  }

  transitionOwner.viewTransition = transition;

  void transition.ready.then(
    () => {
      if (activeMoonPhaseTransition !== transitionOwner) return;

      try {
        transitionOwner.animation = root.animate(
          {
            clipPath: transitionLayer === "new" ? clipPath : [...clipPath].reverse(),
          },
          {
            duration: 300,
            easing: "ease-in",
            fill: "both",
            pseudoElement: `::view-transition-${transitionLayer}(root)`,
          } as ViewTransitionAnimationOptions,
        );
      } catch {
        transition.skipTransition();
      }
    },
    () => undefined,
  );

  const finishTransition = () => {
    if (activeMoonPhaseTransition !== transitionOwner) return;
    transitionOwner.animation?.cancel();
    activeMoonPhaseTransition = undefined;
    root.removeAttribute("data-moon-phase-transition");
  };
  void transition.finished.then(finishTransition, finishTransition);
};

const initialMoonPhase = isMoonPhase(root.dataset.moonPhase)
  ? root.dataset.moonPhase
  : configuredMoonPhase;
applyMoonPhaseImmediately(initialMoonPhase);

moonPhaseSwitcher?.addEventListener(
  "click",
  (event) => {
    if (pointerTransitionOrigin || event.detail === 0 || !(event.target instanceof Element)) return;
    const option = event.target
      .closest<HTMLElement>(".moon-phase-option")
      ?.querySelector<HTMLInputElement>("[data-moon-phase-option]");
    if (!option || !isMoonPhase(option.value)) return;

    const origin = { phase: option.value, x: event.clientX, y: event.clientY };
    pointerTransitionOrigin = origin;
    queueMicrotask(() => {
      if (pointerTransitionOrigin === origin) pointerTransitionOrigin = undefined;
    });
  },
  { capture: true },
);

moonPhaseOptions.forEach((option) => {
  option.addEventListener("change", () => {
    if (!option.checked || !isMoonPhase(option.value)) return;
    const origin = getMoonPhaseTransitionOrigin(option);
    pointerTransitionOrigin = undefined;
    moonPhaseSwitcher?.removeAttribute("open");
    moonPhaseSummary?.focus();
    applyMoonPhaseWithTransition(option.value, true, origin);
  });
});

systemLightPreference.addEventListener("change", () => {
  if (root.dataset.moonPhase === "system") applyMoonPhaseImmediately("system");
});

window.addEventListener("storage", (event) => {
  if (event.storageArea !== window.localStorage) return;
  if (event.key !== moonPhaseStorageKey && event.key !== null) return;
  applyMoonPhaseImmediately(isMoonPhase(event.newValue) ? event.newValue : configuredMoonPhase);
});

headerPreferenceSwitchers.forEach((switcher) => {
  switcher.addEventListener("toggle", () => {
    if (!switcher.open) return;
    headerPreferenceSwitchers.forEach((otherSwitcher) => {
      if (otherSwitcher !== switcher) otherSwitcher.open = false;
    });
  });

  switcher.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !switcher.open) return;
    switcher.open = false;
    switcher.querySelector<HTMLElement>("summary")?.focus();
  });
});

document.addEventListener("pointerdown", (event) => {
  headerPreferenceSwitchers.forEach((switcher) => {
    if (switcher.open && !switcher.contains(event.target as Node)) switcher.open = false;
  });
});

type LinkFeedItemPayload = Record<string, unknown>;

interface LinkFeedPagePayload {
  items: LinkFeedItemPayload[];
  hasNext: boolean;
  nextBeforePublishedAt: string;
  nextBeforeId: string;
}

const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
const panel = document.querySelector<HTMLElement>("[data-menu-panel]");
const backdrop = document.querySelector<HTMLButtonElement>("[data-menu-backdrop]");
const progress = document.querySelector<HTMLElement>("[data-page-progress]");
const articleContent = document.querySelector<HTMLElement>(".article-content");
const articleToc = document.querySelector<HTMLElement>("[data-article-toc]");
const readingTimeOutput = document.querySelector<HTMLElement>("[data-reading-time]");
const readerTools = document.querySelector<HTMLElement>("[data-reader-tools]");
const readerSettings = readerTools?.querySelector<HTMLDetailsElement>("[data-reader-settings]");
const readerSettingsEnabled = Boolean(
  readerTools && readerTools.dataset.readerSettingsEnabled !== "false",
);
const readerFeedback = readerTools?.querySelector<HTMLElement>("[data-reader-feedback]");
const articleShare = readerTools?.querySelector<HTMLButtonElement>("[data-article-share]");
const articlePrint = readerTools?.querySelector<HTMLButtonElement>("[data-article-print]");
const siteMark = document.querySelector<HTMLElement>("[data-home-mark]");
const socialImageDialog = document.querySelector<HTMLDialogElement>("[data-social-image-dialog]");
const socialImagePreview = socialImageDialog?.querySelector<HTMLImageElement>("[data-social-image-preview]");
const socialImageTitle = socialImageDialog?.querySelector<HTMLElement>("[data-social-image-title]");
const socialImageClose = socialImageDialog?.querySelector<HTMLButtonElement>("[data-social-image-close]");

const menuBackground = Array.from(
  document.querySelectorAll<HTMLElement>(".site-main, .site-footer"),
);

let setMobileMenuOpen: ((open: boolean, restoreFocus?: boolean) => void) | undefined;

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose Clipboard but deny it at runtime; use the legacy fallback below.
    }
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.inset = "-100vh auto auto -100vw";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Clipboard copy was rejected");
};

let readerFeedbackTimer = 0;
const announceReaderFeedback = (value: string) => {
  if (!readerFeedback) return;
  window.clearTimeout(readerFeedbackTimer);
  readerFeedback.textContent = value;
  readerFeedbackTimer = window.setTimeout(() => {
    readerFeedback.textContent = "";
  }, 4200);
};

if (articleContent && readingTimeOutput) {
  const text = articleContent.textContent?.replace(/\s+/g, " ").trim() || "";
  const eastAsianCharacters = text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/g)?.length || 0;
  const latinWords = text
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/g, " ")
    .match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length || 0;
  const minutes = Math.max(1, Math.ceil(eastAsianCharacters / 500 + latinWords / 225));
  readingTimeOutput.textContent = formatMessage("readingTime", minutes);
}

articleShare?.addEventListener("click", () => {
  if (articleShare.disabled) return;
  articleShare.disabled = true;
  articleShare.setAttribute("aria-busy", "true");

  void (async () => {
    const shareUrl =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ||
      new URL(window.location.pathname, window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: readerTools?.dataset.shareTitle || document.title,
          url: shareUrl,
        });
        announceReaderFeedback(message("shareComplete"));
      } else {
        await copyText(shareUrl);
        announceReaderFeedback(message("linkCopied"));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyText(shareUrl);
        announceReaderFeedback(message("linkCopied"));
      } catch {
        announceReaderFeedback(message("shareError"));
      }
    } finally {
      articleShare.disabled = false;
      articleShare.removeAttribute("aria-busy");
    }
  })();
});

articlePrint?.addEventListener("click", () => window.print());

type ReaderPreferenceKey = "fontSize" | "lineHeight" | "contentWidth";
type ReaderPreferences = Record<ReaderPreferenceKey, number>;

const readerPreferenceDefaults: ReaderPreferences = {
  fontSize: 17,
  lineHeight: 1.8,
  contentWidth: 750,
};
const readerPreferenceStorageKey = "moonlit-mountain.reader-preferences.v1";
const readerPreferenceBounds: Record<ReaderPreferenceKey, { min: number; max: number }> = {
  fontSize: { min: 15, max: 21 },
  lineHeight: { min: 1.55, max: 2.05 },
  contentWidth: { min: 640, max: 860 },
};
const readerInputs = Array.from(
  readerTools?.querySelectorAll<HTMLInputElement>("[data-reader-setting]") || [],
);

const isReaderPreferenceKey = (value: string): value is ReaderPreferenceKey =>
  value === "fontSize" || value === "lineHeight" || value === "contentWidth";

const readStoredReaderPreferences = (): ReaderPreferences => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(readerPreferenceStorageKey) || "null");
    if (!stored || typeof stored !== "object") return { ...readerPreferenceDefaults };

    const preferences = { ...readerPreferenceDefaults };
    (Object.keys(preferences) as ReaderPreferenceKey[]).forEach((key) => {
      const value = Number((stored as Record<string, unknown>)[key]);
      const { min, max } = readerPreferenceBounds[key];
      if (Number.isFinite(value) && value >= min && value <= max) preferences[key] = value;
    });
    return preferences;
  } catch {
    return { ...readerPreferenceDefaults };
  }
};

let readerPreferences = readerSettingsEnabled
  ? readStoredReaderPreferences()
  : { ...readerPreferenceDefaults };

const formatReaderPreference = (key: ReaderPreferenceKey, value: number) => {
  if (key === "lineHeight") return value.toFixed(2);
  return `${Math.round(value)} px`;
};

const applyReaderPreferences = (persist = false) => {
  document.body.style.setProperty("--reader-font-size", `${readerPreferences.fontSize}px`);
  document.body.style.setProperty("--reader-line-height", String(readerPreferences.lineHeight));
  document.body.style.setProperty("--reader-content-width", `${readerPreferences.contentWidth}px`);

  readerInputs.forEach((input) => {
    const key = input.dataset.readerSetting || "";
    if (!isReaderPreferenceKey(key)) return;
    input.value = String(readerPreferences[key]);
    const output = readerTools?.querySelector<HTMLOutputElement>(`[data-reader-output="${key}"]`);
    if (output) output.value = formatReaderPreference(key, readerPreferences[key]);
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = ((readerPreferences[key] - min) / (max - min)) * 100;
    input.style.setProperty("--reader-range-progress", `${progress}%`);
  });

  if (!persist) return;
  try {
    localStorage.setItem(readerPreferenceStorageKey, JSON.stringify(readerPreferences));
  } catch {
    // Preference changes still apply for the current page when storage is unavailable.
  }
};

if (readerTools && readerSettingsEnabled) {
  applyReaderPreferences();
  if (readerSettings) readerSettings.open = window.matchMedia("(min-width: 1440px)").matches;

  readerInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.readerSetting || "";
      if (!isReaderPreferenceKey(key)) return;
      const value = Number(input.value);
      const { min, max } = readerPreferenceBounds[key];
      if (!Number.isFinite(value)) return;
      readerPreferences[key] = Math.min(max, Math.max(min, value));
      applyReaderPreferences(true);
      updateScrollState();
    });
  });

  readerTools.querySelector<HTMLButtonElement>("[data-reader-reset]")?.addEventListener("click", () => {
    readerPreferences = { ...readerPreferenceDefaults };
    applyReaderPreferences(true);
    updateScrollState();
    announceReaderFeedback(message("readerReset"));
  });
}

languageOptions.forEach((option) => {
  option.addEventListener("change", () => {
    if (!option.checked) return;
    const language = option.value.trim();
    if (!language) return;

    languageSwitcher?.removeAttribute("open");
    languageSummary?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set("language", language);
    window.location.assign(url.href);
  });
});

const svgIconDataUrlPattern = /^data:image\/svg\+xml(?<base64>;base64)?,(?<payload>.*)$/is;
const base64PayloadPattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const normalizeSvgIconDataUrl = (value: string) => {
  const match = svgIconDataUrlPattern.exec(value);
  if (!match?.groups) return null;

  try {
    const payload = match.groups.payload;
    if (match.groups.base64 && !base64PayloadPattern.test(payload)) return null;

    const markup = match.groups.base64 ? window.atob(payload) : decodeURIComponent(payload);
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const isSvg =
      document.documentElement.localName === "svg" &&
      document.documentElement.namespaceURI === "http://www.w3.org/2000/svg" &&
      !document.querySelector("parsererror");
    if (!isSvg) return null;

    return `data:image/svg+xml,${encodeURIComponent(markup)}`;
  } catch {
    return null;
  }
};

document.querySelectorAll<HTMLElement>("[data-social-icon]").forEach((icon) => {
  const value = icon.dataset.socialIcon?.trim() || "";
  const iconUrl = normalizeSvgIconDataUrl(value);
  if (!iconUrl) return;
  icon.style.setProperty("--social-icon", `url("${iconUrl}")`);
  icon.classList.add("is-ready");
});

const setSiteMarkAvailable = (available: boolean) => {
  if (!siteMark) return;
  if (!available && document.activeElement === siteMark) siteMark.blur();
  siteMark.setAttribute("aria-hidden", String(!available));
  siteMark.toggleAttribute("inert", !available);
  siteMark.tabIndex = available ? 0 : -1;
};

document.querySelectorAll<HTMLElement>("[data-nav-track]").forEach((nav) => {
  const indicator = nav.querySelector<HTMLElement>("[data-nav-indicator]");
  const links = nav.querySelectorAll<HTMLElement>(":scope > ul > li > a, :scope > a, :scope > button");
  if (!indicator || !links.length) return;
  let hideFrame = 0;

  const normalizePath = (value: string) => {
    try {
      const path = new URL(value, window.location.origin).pathname;
      return path === "/" ? path : path.replace(/\/$/, "");
    } catch {
      return value;
    }
  };

  const pagePath = normalizePath(window.location.pathname);
  const navLinks = Array.from(links).filter(
    (link): link is HTMLAnchorElement => link instanceof HTMLAnchorElement,
  );
  const exactActive = navLinks.find(
    (link) => link instanceof HTMLAnchorElement && normalizePath(link.href) === pagePath,
  );
  const prefixActive = navLinks
    .filter((link) => {
      const path = normalizePath(link.href);
      return path !== "/" && pagePath.startsWith(`${path}/`);
    })
    .sort((left, right) => normalizePath(right.href).length - normalizePath(left.href).length)[0];
  const ancestorActive = Array.from(nav.querySelectorAll<HTMLElement>(":scope > ul > li")).find(
    (item) =>
      Array.from(item.querySelectorAll<HTMLAnchorElement>("a")).some((link) => {
        const path = normalizePath(link.href);
        return path === pagePath || (path !== "/" && pagePath.startsWith(`${path}/`));
      }),
  )?.querySelector<HTMLAnchorElement>(":scope > a");
  const contentTemplates = new Set(["post", "archives", "category", "tag", "author"]);
  const archivesPath = normalizePath(document.body.dataset.archivesUri || "/archives");
  const fallbackActive = contentTemplates.has(document.body.dataset.template || "")
    ? Array.from(links).find(
        (link) => link instanceof HTMLAnchorElement && normalizePath(link.href) === archivesPath,
      )
    : undefined;
  const activeLink = exactActive || ancestorActive || prefixActive || fallbackActive;

  if (activeLink instanceof HTMLAnchorElement) activeLink.setAttribute("aria-current", "page");
  nav.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    if (normalizePath(link.href) === pagePath) link.setAttribute("aria-current", "page");
  });

  const moveIndicator = (link: HTMLElement) => {
    window.cancelAnimationFrame(hideFrame);
    const wasVisible = indicator.classList.contains("is-visible");
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const color = getComputedStyle(link).getPropertyValue("--nav-accent").trim();
    if (!wasVisible) indicator.style.transition = "none";
    indicator.style.setProperty("--nav-indicator-x", `${linkRect.left - navRect.left + nav.scrollLeft}px`);
    indicator.style.setProperty("--nav-indicator-width", `${linkRect.width}px`);
    indicator.style.setProperty("--nav-indicator-color", color);
    if (!wasVisible) {
      void indicator.offsetWidth;
      indicator.style.removeProperty("transition");
    }
    indicator.classList.add("is-visible");
  };
  const hideIndicator = () => {
    window.cancelAnimationFrame(hideFrame);
    hideFrame = window.requestAnimationFrame(() => indicator.classList.remove("is-visible"));
  };
  const restoreIndicator = () => {
    if (activeLink) moveIndicator(activeLink);
    else hideIndicator();
  };

  links.forEach((link) => {
    link.addEventListener("mouseenter", () => moveIndicator(link));
    link.addEventListener("focus", () => moveIndicator(link));
  });
  nav.addEventListener("mouseleave", restoreIndicator);
  nav.addEventListener("scroll", restoreIndicator, { passive: true });
  nav.addEventListener("focusout", (event) => {
    if (!nav.contains(event.relatedTarget as Node | null)) restoreIndicator();
  });
  window.addEventListener("resize", restoreIndicator);
  document.addEventListener("moonlit-mountain:moon-phase-change", restoreIndicator);
  restoreIndicator();
});

const activePhotoGroup = new URLSearchParams(window.location.search).get("group")?.trim() || "";
document.querySelectorAll<HTMLAnchorElement>("[data-photo-filter]").forEach((filter) => {
  const active = (filter.dataset.photoGroup?.trim() || "") === activePhotoGroup;
  if (active) filter.setAttribute("aria-current", "page");
  else filter.removeAttribute("aria-current");
});

const photoPrevious = document.querySelector<HTMLAnchorElement>("[data-photo-previous]");
const photoNext = document.querySelector<HTMLAnchorElement>("[data-photo-next]");

if (document.body.dataset.template === "photo" && (photoPrevious || photoNext)) {
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    const interactiveSelector =
      "a, button, input, textarea, select, summary, halo-comment, [role='textbox'], [contenteditable]:not([contenteditable='false'])";
    const fromInteractiveControl = event
      .composedPath()
      .some((node) => node instanceof Element && node.matches(interactiveSelector));
    if (fromInteractiveControl) return;

    const destination = event.key === "ArrowLeft" ? photoPrevious : photoNext;
    if (!destination) return;
    event.preventDefault();
    window.location.assign(destination.href);
  });
}

const momentUpvoteButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-moment-upvote]"),
);
const momentFeedback = document.querySelector<HTMLElement>("[data-moment-feedback]");
const momentUpvoteStorageKey = "halo.upvoted.moment.names";
const upvotedMomentNames = new Set<string>();

try {
  const storedMomentNames: unknown = JSON.parse(localStorage.getItem(momentUpvoteStorageKey) || "[]");
  if (Array.isArray(storedMomentNames)) {
    storedMomentNames.forEach((name) => {
      if (typeof name === "string" && name) upvotedMomentNames.add(name);
    });
  }
} catch {
  // Storage may be unavailable or contain legacy invalid data; voting still works for this page view.
}

const syncMomentUpvoteButton = (button: HTMLButtonElement, upvoted: boolean) => {
  button.setAttribute("aria-pressed", String(upvoted));
  button.setAttribute("aria-label", message(upvoted ? "momentUpvoted" : "momentUpvote"));
  if (upvoted) button.setAttribute("aria-disabled", "true");
  else button.removeAttribute("aria-disabled");
};

momentUpvoteButtons.forEach((button) => {
  const momentName = button.dataset.momentName?.trim() || "";
  if (!momentName) return;
  syncMomentUpvoteButton(button, upvotedMomentNames.has(momentName));

  button.addEventListener("click", async () => {
    if (upvotedMomentNames.has(momentName) || button.disabled) return;

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (momentFeedback) momentFeedback.textContent = message("momentUpvotePending");

    try {
      const response = await fetch("/apis/api.halo.run/v1alpha1/trackers/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: "moment.halo.run",
          plural: "moments",
          name: momentName,
        }),
      });
      if (!response.ok) throw new Error(`Moment upvote failed with ${response.status}`);

      upvotedMomentNames.add(momentName);
      try {
        localStorage.setItem(momentUpvoteStorageKey, JSON.stringify([...upvotedMomentNames]));
      } catch {
        // The request succeeded even if the browser blocks persistent storage.
      }

      momentUpvoteButtons
        .filter((candidate) => candidate.dataset.momentName?.trim() === momentName)
        .forEach((candidate) => {
          const count = candidate.querySelector<HTMLElement>("[data-moment-upvote-count]");
          if (count) count.textContent = String((Number.parseInt(count.textContent || "0", 10) || 0) + 1);
          syncMomentUpvoteButton(candidate, true);
        });
      if (momentFeedback) momentFeedback.textContent = message("momentUpvoteSuccess");
    } catch {
      if (momentFeedback) momentFeedback.textContent = message("momentUpvoteError");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
});

document.querySelectorAll<HTMLElement>(".moment-entry:not(.moment-entry--detail) .moment-entry__card").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--moment-pointer-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--moment-pointer-y", `${event.clientY - rect.top}px`);
  });
  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--moment-pointer-x", "50%");
    card.style.setProperty("--moment-pointer-y", "50%");
  });
});

document.querySelectorAll<HTMLImageElement>("[data-link-logo]").forEach((logo) => {
  const mark = logo.closest<HTMLElement>("[data-link-logo-shell]");
  const showFallback = () => mark?.classList.add("is-fallback");
  logo.addEventListener("error", showFallback, { once: true });
  if (logo.complete && logo.naturalWidth === 0) showFallback();
});

const initializeFeedLogo = (logo: HTMLImageElement) => {
  if (logo.dataset.feedLogoReady === "true") return;
  logo.dataset.feedLogoReady = "true";

  const mark = logo.closest<HTMLElement>(".link-feed-entry__logo");
  const showFallback = () => mark?.classList.add("is-fallback");
  logo.addEventListener("error", showFallback, { once: true });
  if (logo.complete && logo.naturalWidth === 0) showFallback();
};

const initializeFeedLogos = (root: ParentNode) => {
  root.querySelectorAll<HTMLImageElement>("[data-feed-logo]").forEach(initializeFeedLogo);
};

initializeFeedLogos(document);

const linkFeedStream = document.querySelector<HTMLElement>("[data-feed-stream]");
const linkFeedLog = linkFeedStream?.querySelector<HTMLOListElement>("[data-feed-log]");
const linkFeedPagination = linkFeedStream?.querySelector<HTMLElement>("[data-feed-pagination]");
const linkFeedStatus = linkFeedStream?.querySelector<HTMLElement>("[data-feed-status]");

const feedDateFormatter = new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const feedTimeFormatter = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  minute: "2-digit",
});

const readFeedText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const readHttpUrl = (value: unknown) => {
  const candidate = readFeedText(value);
  if (!/^https?:\/\//i.test(candidate)) return "";

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

const createFeedArrow = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M17 7 7 17M8 7h9v9");
  svg.append(path);
  return svg;
};

const appendFeedTime = (story: HTMLElement, rawTime: string) => {
  const date = new Date(rawTime);
  if (!rawTime || Number.isNaN(date.getTime())) {
    const unknown = document.createElement("span");
    unknown.className = "link-feed-entry__time link-feed-entry__time--unknown";
    unknown.textContent = message("unknownTime");
    story.append(unknown);
    return;
  }

  const time = document.createElement("time");
  time.className = "link-feed-entry__time";
  time.dateTime = rawTime;

  const day = document.createElement("span");
  day.textContent = feedDateFormatter.format(date);
  const separator = document.createElement("span");
  separator.setAttribute("aria-hidden", "true");
  separator.textContent = "•";
  const clock = document.createElement("small");
  clock.textContent = feedTimeFormatter.format(date);
  time.append(day, separator, clock);
  story.append(time);
};

const createFeedEntry = (item: LinkFeedItemPayload) => {
  const title = readFeedText(item.title) || message("untitledUpdate");
  const author = readFeedText(item.author) || message("friendSite");
  const authorUrl = readHttpUrl(item.authorUrl);
  const authorLogo = readFeedText(item.authorLogo);
  const feedUrl = readHttpUrl(item.url);
  const summary = readFeedText(item.summary);
  const feedTime =
    readFeedText(item.publishedAt) || readFeedText(item.updatedAt) || readFeedText(item.fetchedAt);

  const entry = document.createElement("li");
  entry.className = "link-feed-entry";
  const feedId = readFeedText(item.id);
  if (feedId) entry.dataset.feedId = feedId;

  const source = document.createElement(authorUrl ? "a" : "span");
  source.className = authorUrl
    ? "link-feed-entry__source"
    : "link-feed-entry__source link-feed-entry__source--static";
  if (source instanceof HTMLAnchorElement) {
    source.href = authorUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer external";
    source.setAttribute("aria-label", formatMessage("feedSourceLabel", author));
  }

  const logo = document.createElement("span");
  logo.className = "link-feed-entry__logo";
  if (authorLogo) {
    const image = document.createElement("img");
    image.src = authorLogo;
    image.alt = "";
    image.width = 18;
    image.height = 18;
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.feedLogo = "";
    logo.append(image);
  } else {
    logo.classList.add("is-fallback");
  }

  const fallback = document.createElement("span");
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = Array.from(author)[0] || Array.from(message("friendSite"))[0] || "F";
  logo.append(fallback);

  const authorName = document.createElement("span");
  authorName.textContent = author;
  source.append(logo, authorName);
  entry.append(source);

  const story = document.createElement(feedUrl ? "a" : "div");
  story.className = feedUrl
    ? "link-feed-entry__story"
    : "link-feed-entry__story link-feed-entry__story--static";
  if (story instanceof HTMLAnchorElement) {
    story.href = feedUrl;
    story.target = "_blank";
    story.rel = "noopener noreferrer external";
    story.setAttribute("aria-label", formatMessage("feedStoryLabel", author, title));
  }

  const heading = document.createElement("strong");
  heading.textContent = title;
  story.append(heading);
  if (summary) {
    const excerpt = document.createElement("span");
    excerpt.className = "link-feed-entry__summary";
    excerpt.textContent = summary;
    story.append(excerpt);
  }
  appendFeedTime(story, feedTime);

  if (story instanceof HTMLAnchorElement) {
    const callToAction = document.createElement("span");
    callToAction.className = "link-feed-entry__cta";
    callToAction.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = message("read");
    callToAction.append(label, createFeedArrow());
    story.append(callToAction);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "link-feed-entry__unavailable";
    unavailable.textContent = message("feedUnavailable");
    story.append(unavailable);
  }

  entry.append(story);
  const spectralLine = document.createElement("span");
  spectralLine.className = "link-feed-entry__spectral-line";
  spectralLine.setAttribute("aria-hidden", "true");
  entry.append(spectralLine);
  return entry;
};

const parseLinkFeedPage = (value: unknown): LinkFeedPagePayload | null => {
  if (!value || typeof value !== "object") return null;
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.items) || typeof page.hasNext !== "boolean") return null;
  const items = page.items.filter(
    (item): item is LinkFeedItemPayload => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  return {
    items,
    hasNext: page.hasNext,
    nextBeforePublishedAt: readFeedText(page.nextBeforePublishedAt),
    nextBeforeId: readFeedText(page.nextBeforeId),
  };
};

if (linkFeedStream && linkFeedLog && linkFeedPagination && linkFeedStatus) {
  let feedRequestPending = false;
  const loadedFeedIds = new Set(
    Array.from(linkFeedLog.querySelectorAll<HTMLElement>("[data-feed-id]"))
      .map((entry) => entry.dataset.feedId?.trim() || "")
      .filter(Boolean),
  );

  const setFeedBusy = (button: HTMLAnchorElement, busy: boolean) => {
    feedRequestPending = busy;
    linkFeedLog.setAttribute("aria-busy", String(busy));
    if (busy) {
      linkFeedStream.setAttribute("aria-busy", "true");
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");
      button.classList.add("is-loading");
    } else {
      linkFeedStream.removeAttribute("aria-busy");
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-disabled");
      button.classList.remove("is-loading");
    }
  };

  linkFeedPagination.addEventListener("click", (event) => {
    if (!(event instanceof MouseEvent) || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLAnchorElement>("[data-feed-load-more]");
    if (!button || !linkFeedPagination.contains(button)) return;
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    if (feedRequestPending) {
      event.preventDefault();
      return;
    }

    const beforePublishedAt = button.dataset.beforePublishedAt?.trim() || "";
    const beforeId = button.dataset.beforeId?.trim() || "";
    if (!beforePublishedAt || !beforeId) return;

    event.preventDefault();
    const fromKeyboard = event.detail === 0;
    const defaultLabel = button.dataset.feedDefaultLabel || button.textContent?.trim() || message("feedLoadMore");
    button.dataset.feedDefaultLabel = defaultLabel;
    button.classList.remove("is-error");
    button.textContent = message("feedLoadingButton");
    linkFeedStatus.textContent = message("feedLoadingStatus");
    setFeedBusy(button, true);

    void (async () => {
      try {
        const endpoint = new URL("/apis/api.link.halo.run/v1alpha1/linkfeeds", window.location.origin);
        endpoint.searchParams.set("limit", "12");
        endpoint.searchParams.set("beforePublishedAt", beforePublishedAt);
        endpoint.searchParams.set("beforeId", beforeId);
        const groupName = button.dataset.feedGroup?.trim();
        if (groupName) endpoint.searchParams.set("groupName", groupName);

        const response = await fetch(endpoint, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Link feed request failed with ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Link feed response was not JSON");
        }

        const page = parseLinkFeedPage(await response.json());
        if (!page) throw new Error("Link feed response shape was invalid");
        if (page.hasNext && (!page.nextBeforePublishedAt || !page.nextBeforeId)) {
          throw new Error("Link feed cursor pair was incomplete");
        }

        const entries = page.items
          .filter((item) => {
            const id = readFeedText(item.id);
            return !id || !loadedFeedIds.has(id);
          })
          .map(createFeedEntry);

        entries.forEach((entry) => {
          const id = entry.dataset.feedId;
          if (id) loadedFeedIds.add(id);
          linkFeedLog.append(entry);
          initializeFeedLogos(entry);
        });

        const firstNewEntry = entries[0];
        if (page.hasNext) {
          button.dataset.beforePublishedAt = page.nextBeforePublishedAt;
          button.dataset.beforeId = page.nextBeforeId;
          const fallbackUrl = new URL(button.href);
          fallbackUrl.searchParams.set("beforePublishedAt", page.nextBeforePublishedAt);
          fallbackUrl.searchParams.set("beforeId", page.nextBeforeId);
          fallbackUrl.hash = "friend-updates";
          button.href = fallbackUrl.href;
          button.textContent = defaultLabel;
          linkFeedStatus.textContent = formatMessage("feedLoaded", entries.length);
        } else {
          const end = document.createElement("span");
          end.className = "links-feed-pagination__end";
          end.textContent = message("feedReachedStart");
          end.tabIndex = -1;
          button.replaceWith(end);
          linkFeedStatus.textContent = formatMessage("feedLoadedReachedStart", entries.length);
          if (fromKeyboard && !firstNewEntry) end.focus({ preventScroll: true });
        }

        if (fromKeyboard && firstNewEntry) {
          const firstStory = firstNewEntry.querySelector<HTMLAnchorElement>(
            "a.link-feed-entry__story",
          );
          const focusTarget = firstStory || firstNewEntry;
          if (!firstStory) firstNewEntry.tabIndex = -1;
          focusTarget.focus({ preventScroll: true });
        }
      } catch {
        button.textContent = message("feedRetry");
        button.classList.add("is-error");
        linkFeedStatus.textContent = message("feedError");
      } finally {
        setFeedBusy(button, false);
      }
    })();
  });
}

document.querySelectorAll<HTMLElement>("[data-link-domain]").forEach((coordinate) => {
  const value = coordinate.textContent?.trim();
  if (!value) return;
  try {
    const url = new URL(value, window.location.origin);
    coordinate.textContent = url.hostname.replace(/^www\./, "") || value;
  } catch {
    // Keep the original URL when legacy data is not parseable.
  }
});

const submenuToggles = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-submenu-toggle]"),
);

const positionSubmenu = (item: HTMLElement) => {
  if (window.innerWidth < 768 || item.dataset.menuLevel === "1") return;
  item.classList.remove("opens-right");
  window.requestAnimationFrame(() => {
    const submenu = item.querySelector<HTMLElement>(":scope > .submenu");
    if (submenu && submenu.getBoundingClientRect().left < 16) item.classList.add("opens-right");
  });
};

const setSubmenuOpen = (toggle: HTMLButtonElement, open: boolean, restoreFocus = false) => {
  const item = toggle.closest<HTMLElement>(".has-children");
  if (!item) return;

  if (open) {
    item.parentElement
      ?.querySelectorAll<HTMLElement>(":scope > .has-children.is-submenu-open")
      .forEach((sibling) => {
        if (sibling === item) return;
        sibling.classList.remove("is-submenu-open");
        sibling.querySelector<HTMLButtonElement>(":scope > [data-submenu-toggle]")?.setAttribute(
          "aria-expanded",
          "false",
        );
      });
  } else {
    item.querySelectorAll<HTMLElement>(".has-children.is-submenu-open").forEach((child) => {
      child.classList.remove("is-submenu-open");
      child.querySelector<HTMLButtonElement>(":scope > [data-submenu-toggle]")?.setAttribute(
        "aria-expanded",
        "false",
      );
    });
  }

  item.classList.toggle("is-submenu-open", open);
  if (!open) item.querySelectorAll<HTMLElement>(".opens-right").forEach((child) => child.classList.remove("opens-right"));
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute(
    "aria-label",
    formatMessage(
      open ? "submenuCollapse" : "submenuExpand",
      toggle.dataset.submenuLabel || message("submenuCurrent"),
    ),
  );
  if (open) positionSubmenu(item);
  if (restoreFocus) toggle.focus({ preventScroll: true });
};

const closeAllSubmenus = () => {
  submenuToggles.forEach((submenuToggle) => setSubmenuOpen(submenuToggle, false));
};

submenuToggles.forEach((submenuToggle) => {
  const item = submenuToggle.closest<HTMLElement>(".has-children");
  const parentLink = item?.querySelector<HTMLAnchorElement>(":scope > a");
  const focusFirstChild = () => {
    setSubmenuOpen(submenuToggle, true);
    item?.querySelector<HTMLAnchorElement>(":scope > .submenu a")?.focus({ preventScroll: true });
  };

  submenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setSubmenuOpen(submenuToggle, submenuToggle.getAttribute("aria-expanded") !== "true");
  });
  submenuToggle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusFirstChild();
  });
  parentLink?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusFirstChild();
  });
  item?.addEventListener("mouseenter", () => positionSubmenu(item));
});

document.addEventListener("click", (event) => {
  if (!(event.target as Element).closest(".site-nav")) closeAllSubmenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const item = (document.activeElement as Element | null)?.closest<HTMLElement>(
    ".has-children.is-submenu-open",
  );
  const submenuToggle = item?.querySelector<HTMLButtonElement>(":scope > [data-submenu-toggle]");
  if (submenuToggle) {
    event.stopImmediatePropagation();
    setSubmenuOpen(submenuToggle, false, true);
  }
});

if (toggle && panel && backdrop) {
  const setOpen = (open: boolean, restoreFocus = false) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", message(open ? "menuClose" : "menuOpen"));
    panel.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    backdrop.setAttribute("aria-hidden", String(!open));
    backdrop.tabIndex = open ? 0 : -1;
    document.body.classList.toggle("menu-open", open);
    menuBackground.forEach((element) => element.toggleAttribute("inert", open));

    if (!open) closeAllSubmenus();

    if (open) {
      window.requestAnimationFrame(() => {
        panel.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
      });
    } else if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  };

  setMobileMenuOpen = setOpen;

  toggle.addEventListener("click", () => {
    if ("vibrate" in navigator) navigator.vibrate(10);
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  backdrop.addEventListener("click", () => setOpen(false, true));
  panel.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false, true);
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || toggle.getAttribute("aria-expanded") !== "true") return;

    const panelControls = Array.from(
      panel.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== "hidden";
    });
    const focusable = [toggle, ...panelControls];
    const firstPanelControl = panelControls[0];
    const lastPanelControl = panelControls.at(-1);
    const active = document.activeElement;

    if (!firstPanelControl || !lastPanelControl) return;
    if (active === toggle) {
      event.preventDefault();
      (event.shiftKey ? lastPanelControl : firstPanelControl).focus({ preventScroll: true });
    } else if (event.shiftKey && active === firstPanelControl) {
      event.preventDefault();
      toggle.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === lastPanelControl) {
      event.preventDefault();
      toggle.focus({ preventScroll: true });
    } else if (!focusable.includes(active as HTMLElement)) {
      event.preventDefault();
      firstPanelControl.focus({ preventScroll: true });
    }
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-search-trigger]").forEach((searchTrigger) => {
  searchTrigger.addEventListener("click", () => {
    if (toggle?.getAttribute("aria-expanded") === "true") setMobileMenuOpen?.(false);
    window.SearchWidget?.open();
  });
});

let socialImageReturnTarget: HTMLElement | null = null;

const openImageFallback = (src: string) => {
  window.open(src, "_blank", "noopener,noreferrer");
};

const restoreImageFallbackFocus = () => {
  const returnTarget = socialImageReturnTarget;
  socialImageReturnTarget = null;
  window.requestAnimationFrame(() => {
    if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
  });
};

document.querySelectorAll<HTMLButtonElement>("[data-social-image-trigger]").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    if (!socialImageDialog || !socialImagePreview || !socialImageTitle) return;
    const src = trigger.dataset.socialImageSrc?.trim();
    if (!src) return;

    const name = trigger.dataset.socialImageName?.trim() || message("socialDefaultName");
    const mobileMenuOpen = toggle?.getAttribute("aria-expanded") === "true";
    socialImageReturnTarget = mobileMenuOpen ? toggle : trigger;
    if (mobileMenuOpen) setMobileMenuOpen?.(false);

    if (typeof socialImageDialog.showModal !== "function") {
      openImageFallback(src);
      restoreImageFallbackFocus();
      return;
    }

    socialImageTitle.textContent = name;
    socialImagePreview.src = src;
    socialImagePreview.alt = formatMessage("socialImageAlt", name);
    try {
      socialImageDialog.showModal();
    } catch {
      socialImagePreview.removeAttribute("src");
      socialImagePreview.alt = "";
      openImageFallback(src);
      restoreImageFallbackFocus();
      return;
    }
    document.body.classList.add("social-dialog-open");
    window.requestAnimationFrame(() => socialImageClose?.focus({ preventScroll: true }));
  });
});

socialImageClose?.addEventListener("click", () => socialImageDialog?.close());
socialImageDialog?.addEventListener("click", (event) => {
  if (event.target === socialImageDialog) socialImageDialog.close();
});
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape" || !socialImageDialog?.open) return;
    event.preventDefault();
    event.stopPropagation();
    socialImageDialog.close();
  },
  true,
);
socialImageDialog?.addEventListener("close", () => {
  document.body.classList.remove("social-dialog-open");
  socialImagePreview?.removeAttribute("src");
  if (socialImagePreview) socialImagePreview.alt = "";
  const returnTarget = socialImageReturnTarget;
  socialImageReturnTarget = null;
  if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
});

const tocToggle = document.querySelector<HTMLButtonElement>("[data-toc-toggle]");
const tocBackdrop = document.querySelector<HTMLButtonElement>("[data-toc-backdrop]");
const tocList = articleToc?.querySelector<HTMLElement>("[data-toc-list]");
const tocHeadings = articleContent
  ? Array.from(articleContent.querySelectorAll<HTMLElement>("h2, h3"))
  : [];

tocHeadings.forEach((heading, index) => {
  if (!heading.id) heading.id = `section-${index + 1}`;
  const link = document.createElement("a");
  link.href = `#${heading.id}`;
  link.textContent = heading.textContent || formatMessage("tocSection", index + 1);
  link.dataset.level = heading.tagName === "H3" ? "3" : "2";
  tocList?.append(link);
});

const tocLinks = Array.from(tocList?.querySelectorAll<HTMLAnchorElement>("a") || []);
const hasToc = tocHeadings.length > 0 && tocLinks.length > 0;
const isDesktopToc = () => window.innerWidth >= 1440;

const setInteractiveVisibility = (element: HTMLElement | null, visible: boolean) => {
  if (!element) return;
  if (!visible && document.activeElement instanceof HTMLElement && element.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  element.setAttribute("aria-hidden", String(!visible));
  element.toggleAttribute("inert", !visible);
  element.hidden = !visible;
  if (element instanceof HTMLButtonElement) element.tabIndex = visible ? 0 : -1;
};

const setTocToggleAvailable = (available: boolean) => {
  setInteractiveVisibility(tocToggle, available);
};

const setTocExpanded = (expanded: boolean) => {
  articleToc?.classList.toggle("is-open", expanded);
  tocBackdrop?.classList.toggle("is-open", expanded);
  tocToggle?.setAttribute("aria-expanded", String(expanded));
  tocToggle?.setAttribute("aria-label", message(expanded ? "tocClose" : "tocOpen"));
};

const syncTocAccessibility = (top = window.scrollY) => {
  if (!articleContent || !articleToc || !hasToc) {
    setTocExpanded(false);
    articleToc?.classList.remove("is-visible");
    setInteractiveVisibility(articleToc, false);
    setInteractiveVisibility(tocBackdrop, false);
    setTocToggleAvailable(false);
    return;
  }

  if (isDesktopToc()) {
    const end = articleContent.offsetTop + articleContent.offsetHeight;
    const visible = top > articleContent.offsetTop - 160 && top < end - 240;
    setTocExpanded(false);
    articleToc.classList.toggle("is-visible", visible);
    setInteractiveVisibility(articleToc, visible);
    setInteractiveVisibility(tocBackdrop, false);
    setTocToggleAvailable(false);
    return;
  }

  articleToc.classList.remove("is-visible");
  const expanded = articleToc.classList.contains("is-open");
  setInteractiveVisibility(articleToc, expanded);
  setInteractiveVisibility(tocBackdrop, expanded);
  setTocToggleAvailable(true);
};

const closeToc = (restoreFocus = false) => {
  setTocExpanded(false);
  setInteractiveVisibility(articleToc, false);
  setInteractiveVisibility(tocBackdrop, false);
  setTocToggleAvailable(hasToc && !isDesktopToc());
  if (restoreFocus && tocToggle && !tocToggle.hidden) tocToggle.focus({ preventScroll: true });
};

const openToc = () => {
  if (!articleToc || !hasToc || isDesktopToc()) return;
  setInteractiveVisibility(articleToc, true);
  setInteractiveVisibility(tocBackdrop, true);
  setTocExpanded(true);
  setTocToggleAvailable(true);
  tocLinks[0]?.focus({ preventScroll: true });
};

if (articleContent && articleToc && hasToc) {
  tocToggle?.addEventListener("click", () => {
    if (articleToc.classList.contains("is-open")) closeToc(true);
    else openToc();
  });
  tocBackdrop?.addEventListener("click", () => closeToc(true));
  tocLinks.forEach((link) =>
    link.addEventListener("click", () => {
      if (!isDesktopToc()) closeToc();
    }),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && articleToc.classList.contains("is-open")) closeToc(true);
  });

  const tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach((link) => link.classList.toggle("is-active", link.hash === `#${entry.target.id}`));
      });
    },
    { rootMargin: "-18% 0px -68%", threshold: 0 },
  );
  tocHeadings.forEach((heading) => tocObserver.observe(heading));
}

let scrollFrame = 0;
const updateScrollState = () => {
  const top = window.scrollY;

  if (siteMark) {
    if (window.innerWidth < 768) {
      if (document.body.dataset.template === "index") {
        const markOpacity = Math.min(1, Math.max(0, (top - 300) / 200));
        const markVisible = markOpacity > 0.05;
        siteMark.style.setProperty("--mobile-mark-opacity", String(markOpacity));
        siteMark.classList.toggle("is-mobile-visible", markVisible);
        setSiteMarkAvailable(markVisible);
      } else {
        siteMark.style.removeProperty("--mobile-mark-opacity");
        siteMark.classList.remove("is-mobile-visible");
        setSiteMarkAvailable(true);
      }
    } else {
      siteMark.style.removeProperty("--mobile-mark-opacity");
      siteMark.classList.remove("is-mobile-visible");
      if (document.body.dataset.template === "index") {
        const markOpacity = Math.min(1, Math.max(0, (top - 300) / 200));
        const markVisible = markOpacity > 0.05;
        siteMark.style.setProperty("--desktop-mark-opacity", String(markOpacity));
        siteMark.classList.toggle("is-desktop-visible", markVisible);
        setSiteMarkAvailable(markVisible);
      } else {
        siteMark.style.removeProperty("--desktop-mark-opacity");
        siteMark.classList.remove("is-desktop-visible");
        setSiteMarkAvailable(true);
      }
    }
  }

  if (progress) {
    const start = articleContent?.offsetTop ?? 0;
    const available = articleContent
      ? Math.max(1, articleContent.offsetHeight - window.innerHeight)
      : document.documentElement.scrollHeight - window.innerHeight;
    const readingProgress = Math.min(1, Math.max(0, (top - start) / available));
    progress.style.transform = `scaleX(${readingProgress})`;
    progress.style.opacity = readingProgress > 0.99 ? String((1 - readingProgress) * 100) : "1";
  }

  syncTocAccessibility(top);
  scrollFrame = 0;
};

window.addEventListener(
  "scroll",
  () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollState);
  },
  { passive: true },
);
updateScrollState();
window.addEventListener("resize", updateScrollState);

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("motion-ready");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 },
  );
  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
    revealObserver.observe(element);
  });
}
